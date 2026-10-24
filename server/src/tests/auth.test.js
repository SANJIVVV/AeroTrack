import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { OtpChallenge, Session, User } from '../models/index.js';
import { advance, agent, signedInAs, useTestApp } from './helpers.js';

const h = useTestApp('auth');

describe('registration and OTP email verification', () => {
  it('registers, emails a 6-digit code, verifies it once and signs the user in', async () => {
    const a = agent(h);
    const res = await a.post('/api/auth/register', { name: 'Asha', email: 'Asha@Example.com', password: 'secure-pass-123' });
    expect(res.status).toBe(202);
    expect(res.body.devOtp).toBeUndefined(); // only in dev email mode
    const user = await User.findOne({ email: 'asha@example.com' });
    expect(user?.emailVerified).toBe(false);
    expect(user?.role).toBe('passenger');

    // Unverified users cannot sign in yet.
    const early = await agent(h).post('/api/auth/login', { email: 'asha@example.com', password: 'secure-pass-123' });
    expect(early.status).toBe(403);
    expect(early.body.error.code).toBe('EMAIL_NOT_VERIFIED');

    const code = h.email.lastCodeFor('asha@example.com', 'verification');
    expect(code).toMatch(/^\d{6}$/);
    // Only a hash is stored.
    const stored = await OtpChallenge.findOne({ user: user._id }).lean();
    expect(JSON.stringify(stored)).not.toContain(code);

    const ok = await a.post('/api/auth/verify-otp', { email: 'asha@example.com', code });
    expect(ok.status).toBe(200);
    expect(ok.body.user.emailVerified).toBe(true);
    expect((await a.get('/api/auth/me')).body.user.email).toBe('asha@example.com');
    // Single use.
    const again = await agent(h).post('/api/auth/verify-otp', { email: 'asha@example.com', code });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('INVALID_CODE');
  });

  it('does not reveal whether an email is already registered', async () => {
    const a = agent(h);
    const first = await a.post('/api/auth/register', { name: 'Dup', email: 'dup@example.com', password: 'secure-pass-123' });
    const second = await a.post('/api/auth/register', { name: 'Dup', email: 'dup@example.com', password: 'other-pass-456' });
    expect(second.status).toBe(202);
    expect(second.body.message).toBe(first.body.message);
    expect(await User.countDocuments({ email: 'dup@example.com' })).toBe(1);
  });

  it('expires codes after five minutes', async () => {
    await agent(h).post('/api/auth/register', { name: 'Late', email: 'late@example.com', password: 'secure-pass-123' });
    const code = h.email.lastCodeFor('late@example.com');
    advance(h, 6);
    expect((await agent(h).post('/api/auth/verify-otp', { email: 'late@example.com', code })).status).toBe(400);
  });

  it('locks a code after five wrong attempts', async () => {
    await agent(h).post('/api/auth/register', { name: 'Guess', email: 'guess@example.com', password: 'secure-pass-123' });
    const code = h.email.lastCodeFor('guess@example.com');
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) expect((await agent(h).post('/api/auth/verify-otp', { email: 'guess@example.com', code: wrong })).status).toBe(400);
    const locked = await agent(h).post('/api/auth/verify-otp', { email: 'guess@example.com', code });
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('TOO_MANY_ATTEMPTS');
  });

  it('enforces a resend cooldown and invalidates the previous code', async () => {
    await agent(h).post('/api/auth/register', { name: 'Again', email: 'again@example.com', password: 'secure-pass-123' });
    const first = h.email.lastCodeFor('again@example.com');
    const sentBefore = h.email.sent.length;
    expect((await agent(h).post('/api/auth/resend-otp', { email: 'again@example.com' })).status).toBe(202);
    expect(h.email.sent.length).toBe(sentBefore); // still cooling down
    advance(h, 1.5);
    await agent(h).post('/api/auth/resend-otp', { email: 'again@example.com' });
    const second = h.email.lastCodeFor('again@example.com');
    expect(h.email.sent.length).toBe(sentBefore + 1);
    if (first !== second) expect((await agent(h).post('/api/auth/verify-otp', { email: 'again@example.com', code: first })).status).toBe(400);
    expect((await agent(h).post('/api/auth/verify-otp', { email: 'again@example.com', code: second })).status).toBe(200);
  });

  it('rejects malformed codes', async () => {
    const res = await agent(h).post('/api/auth/verify-otp', { email: 'x@example.com', code: '12ab56' });
    expect(res.status).toBe(400);
  });

  it('validates input and rejects weak passwords', async () => {
    const res = await agent(h).post('/api/auth/register', { name: 'X', email: 'not-an-email', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.details.length).toBeGreaterThan(0);
  });

  it('rejects NoSQL operator injection in login', async () => {
    const res = await agent(h).post('/api/auth/login', { email: { $gt: '' }, password: { $gt: '' } });
    expect(res.status).toBe(400);
  });
});

describe('sessions', () => {
  it('logs in, exposes /me without secrets, and logs out invalidating the session', async () => {
    const { agent: a } = await signedInAs(h, 'passenger');
    const me = await a.get('/api/auth/me');
    expect(me.body.user.role).toBe('passenger');
    expect(JSON.stringify(me.body)).not.toMatch(/passwordHash|tokenHash/);
    const before = await Session.countDocuments();
    expect((await a.post('/api/auth/logout')).status).toBe(204);
    expect(await Session.countDocuments()).toBe(before - 1);
    expect((await a.get('/api/auth/me')).body.user).toBeNull();
  });

  it('uses a generic error for bad credentials', async () => {
    const { email } = await signedInAs(h, 'passenger');
    const wrong = await agent(h).post('/api/auth/login', { email, password: 'wrong-password-1' });
    const unknown = await agent(h).post('/api/auth/login', { email: 'nobody@example.com', password: 'wrong-password-1' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it('sets an httpOnly session cookie', async () => {
    const { email, password } = await signedInAs(h, 'passenger');
    const res = await agent(h).post('/api/auth/login', { email, password });
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/aerotrack_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it('requires the CSRF header on state-changing requests', async () => {
    const res = await request(h.app).post('/api/auth/login').send({ email: 'a@b.co', password: 'x' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF');
  });
});

describe('password reset', () => {
  it('resets the password with a single-use code and signs out all sessions', async () => {
    const { agent: a, email, user } = await signedInAs(h, 'passenger');
    expect((await agent(h).post('/api/auth/forgot-password', { email })).status).toBe(202);
    const code = h.email.lastCodeFor(email, 'reset');
    expect(code).toMatch(/^\d{6}$/);
    const res = await agent(h).post('/api/auth/reset-password', { email, code, password: 'brand-new-pass-9' });
    expect(res.status).toBe(200);
    expect(await Session.countDocuments({ user: user._id })).toBe(0);
    expect((await a.get('/api/auth/me')).body.user).toBeNull();
    expect((await agent(h).post('/api/auth/login', { email, password: 'brand-new-pass-9' })).status).toBe(200);
    expect((await agent(h).post('/api/auth/reset-password', { email, code, password: 'another-pass-99' })).status).toBe(400);
  });

  it('expires reset codes after five minutes', async () => {
    const { email } = await signedInAs(h, 'passenger');
    await agent(h).post('/api/auth/forgot-password', { email });
    const code = h.email.lastCodeFor(email, 'reset');
    advance(h, 6);
    expect((await agent(h).post('/api/auth/reset-password', { email, code, password: 'brand-new-pass-9' })).status).toBe(400);
  });

  it('responds identically for unknown emails', async () => {
    const res = await agent(h).post('/api/auth/forgot-password', { email: 'ghost@example.com' });
    expect(res.status).toBe(202);
  });
});

describe('authorization basics', () => {
  it('blocks passengers from staff and admin endpoints', async () => {
    const { agent: a } = await signedInAs(h, 'passenger');
    expect((await a.get('/api/alerts')).status).toBe(403);
    expect((await a.get('/api/admin/users')).status).toBe(403);
    expect((await a.post('/api/scans', { reference: 'AT-AAAA-AAAA', checkpointCode: 'X' })).status).toBe(403);
    expect((await a.post('/api/demo/seed')).status).toBe(403);
  });

  it('blocks staff from admin-only endpoints', async () => {
    const { agent: a } = await signedInAs(h, 'staff');
    expect((await a.get('/api/admin/users')).status).toBe(403);
    expect((await a.get('/api/admin/analytics')).status).toBe(200);
  });

  it('prevents admins from changing their own role and revokes sessions on role change', async () => {
    const { agent: admin, user: adminUser } = await signedInAs(h, 'admin');
    expect((await admin.patch(`/api/admin/users/${adminUser._id}`, { role: 'passenger' })).status).toBe(400);
    const { agent: p, user } = await signedInAs(h, 'passenger');
    expect((await admin.patch(`/api/admin/users/${user._id}`, { role: 'staff' })).status).toBe(200);
    expect((await p.get('/api/auth/me')).body.user).toBeNull();
  });

  it('rejects oversized request bodies', async () => {
    const res = await agent(h).post('/api/auth/login', { email: 'a@b.co', password: 'x'.repeat(60_000) });
    expect(res.status).toBe(413);
  });
});
