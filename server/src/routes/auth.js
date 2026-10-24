import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

import { Session, User } from '../models/index.js';
import { DevOutboxSender } from '../integrations/email/index.js';
import { issueOtp, verifyOtp } from '../services/otp.js';
import { SESSION_COOKIE, cookieOptions, requireAuth, startSession } from '../middleware/auth.js';
import { parse } from '../validators/common.js';
import { AppError, notFound } from '../utils/errors.js';
import { toPublicUser } from '../services/serializers.js';
import { audit } from '../services/audit.js';

const email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address')).pipe(z.string().max(254));
const password = z
  .string()
  .min(10, 'Use at least 10 characters')
  .refine((p) => Buffer.byteLength(p, 'utf8') <= 72, 'Password is too long')
  .refine((p) => /[a-zA-Z]/.test(p) && /\d/.test(p), 'Use letters and at least one number');

// Used to keep login timing similar whether or not the account exists.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password-0', 12);
const code = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Enter the 6-digit code');

export function authRoutes(ctx, limiters) {
  const r = Router();
  const devMode = ctx.email.mode === 'dev' && ctx.env.NODE_ENV !== 'production';

  /** In development mode the code is returned to the browser and clearly labelled. Never in production. */
  const devExtra = (otp) => (devMode && otp ? { devOtp: otp, devNotice: 'DEVELOPMENT MODE: no email was sent. This code is shown only because SMTP is not configured.' } : {});

  async function sendCode(user, purpose) {
    const otp = await issueOtp(ctx, user._id, purpose);
    if (!otp) return null; // cooldown running; the previous code is still valid
    const verify = purpose === 'verify-email';
    await ctx.email.send({
      to: user.email,
      subject: verify ? 'Your AeroTrack Pro verification code' : 'Your AeroTrack Pro password reset code',
      text: `Hello ${user.name},\n\nYour ${verify ? 'verification' : 'password reset'} code is ${otp}.\nIt expires in 5 minutes and can be used once.\n\nIf you did not request this, you can ignore this email.`,
    });
    return otp;
  }

  r.post('/register', limiters.auth, async (req, res) => {
    const body = parse(z.object({ name: z.string().trim().min(2).max(100), email, password }), req.body);
    const existing = await User.findOne({ email: body.email });
    let otp = null;
    if (!existing) {
      const user = await User.create({ name: body.name, email: body.email, passwordHash: await bcrypt.hash(body.password, 12) });
      otp = await sendCode(user, 'verify-email');
      await audit(user, 'auth.register', { type: 'user', id: String(user._id) });
    } else if (!existing.emailVerified && !existing.isDemo) {
      // Unverified account: send a fresh code to the owner of the address. The password is not changed.
      otp = await sendCode(existing, 'verify-email');
    }
    // Same response whether or not the email was already registered (no account enumeration).
    res.status(202).json({
      message: 'If this email can be registered, a 6-digit code has been sent to it. Enter it to activate your account.',
      emailMode: ctx.email.mode,
      ...devExtra(otp),
    });
  });

  r.post('/verify-otp', limiters.auth, async (req, res) => {
    const body = parse(z.object({ email, code }), req.body);
    const user = await User.findOne({ email: body.email, isDemo: false });
    await verifyOtp(ctx, user?._id, 'verify-email', body.code);
    user.emailVerified = true;
    user.lastLoginAt = ctx.now();
    await user.save();
    await audit(user, 'auth.email_verified', { type: 'user', id: String(user._id) });
    await startSession(ctx.env, req, res, user);
    res.json({ message: 'Email verified. Welcome aboard.', user: toPublicUser(user) });
  });

  r.post('/resend-otp', limiters.email, async (req, res) => {
    const body = parse(z.object({ email, purpose: z.enum(['verify-email', 'reset-password']).default('verify-email') }), req.body);
    const user = await User.findOne({ email: body.email, isDemo: false });
    let otp = null;
    if (user && !user.disabled && (body.purpose === 'reset-password' || !user.emailVerified)) otp = await sendCode(user, body.purpose);
    res
      .status(202)
      .json({ message: 'If a code can be sent to this email, a new one is on its way. You can request another in 60 seconds.', cooldownSeconds: 60, emailMode: ctx.email.mode, ...devExtra(otp) });
  });

  r.post('/login', limiters.auth, async (req, res) => {
    const body = parse(z.object({ email, password: z.string().min(1).max(200) }), req.body);
    const user = await User.findOne({ email: body.email, isDemo: false }).select('+passwordHash');
    const ok = await bcrypt.compare(body.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok || user.disabled) {
      await audit(user, 'auth.login_failed', user ? { type: 'user', id: String(user._id) } : undefined);
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    }
    if (!user.emailVerified) throw new AppError(403, 'EMAIL_NOT_VERIFIED', 'Verify your email with the 6-digit code before signing in.');
    user.lastLoginAt = ctx.now();
    await user.save();
    await startSession(ctx.env, req, res, user);
    await audit(user, 'auth.login', { type: 'user', id: String(user._id) });
    res.json({ user: toPublicUser(user) });
  });

  r.post('/logout', async (req, res) => {
    if (req.sessionId) await Session.deleteOne({ _id: req.sessionId });
    const { maxAge: _maxAge, ...opts } = cookieOptions(ctx.env);
    res.clearCookie(SESSION_COOKIE, opts);
    res.status(204).end();
  });

  r.post('/logout-all', requireAuth, async (req, res) => {
    await Session.deleteMany({ user: req.user._id });
    const { maxAge: _maxAge, ...opts } = cookieOptions(ctx.env);
    res.clearCookie(SESSION_COOKIE, opts);
    await audit(req.user, 'auth.logout_all', { type: 'user', id: String(req.user._id) });
    res.status(204).end();
  });

  r.get('/me', (req, res) => {
    res.json({ user: req.user ? toPublicUser(req.user) : null, emailMode: ctx.email.mode });
  });

  r.post('/forgot-password', limiters.email, async (req, res) => {
    const body = parse(z.object({ email }), req.body);
    const user = await User.findOne({ email: body.email, isDemo: false });
    let otp = null;
    if (user && !user.disabled) {
      otp = await sendCode(user, 'reset-password');
      if (otp) await audit(user, 'auth.reset_requested', { type: 'user', id: String(user._id) });
    }
    res.status(202).json({ message: 'If an account exists for this email, a 6-digit reset code has been sent.', emailMode: ctx.email.mode, ...devExtra(otp) });
  });

  r.post('/reset-password', limiters.auth, async (req, res) => {
    const body = parse(z.object({ email, code, password }), req.body);
    const user = await User.findOne({ email: body.email, isDemo: false });
    await verifyOtp(ctx, user?._id, 'reset-password', body.code);
    // Receiving the code proves control of the inbox, so the email counts as verified.
    await User.updateOne({ _id: user._id }, { passwordHash: await bcrypt.hash(body.password, 12), emailVerified: true });
    await Session.deleteMany({ user: user._id });
    await audit(null, 'auth.password_reset', { type: 'user', id: String(user._id) });
    res.json({ message: 'Password updated. Please sign in again.' });
  });

  // Development only: messages kept in memory by the dev email mode. They were NOT sent.
  r.get('/dev-outbox', (req, res) => {
    if (!devMode || !(ctx.email instanceof DevOutboxSender)) throw notFound('Route');
    const to = typeof req.query.to === 'string' ? req.query.to.toLowerCase() : undefined;
    res.json({
      notice: 'DEVELOPMENT MODE: these emails were NOT sent and are kept only in server memory. Set EMAIL_PROVIDER=smtp to send real email.',
      items: ctx.email.outbox.filter((m) => !to || m.to === to).map((m) => ({ id: m.id, to: m.to, subject: m.subject, text: m.text, createdAt: m.createdAt })),
    });
  });

  return r;
}
