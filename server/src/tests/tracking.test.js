import { randomUUID } from 'node:crypto';
import { describe, expect, it, beforeAll } from 'vitest';
import { parseQrPayload } from '@aerotrack/shared';
import { AnomalyAlert, AuditEvent, Baggage, BaggageEvent, Notification } from '../models/index.js';
import { advance, createFlight, seedCheckpoints, signedInAs, useTestApp } from './helpers.js';
import { runAnomalySweep } from '../services/sweep.js';

const h = useTestApp('tracking');

async function registerBag(harness, a, opts = {}) {
  const flight = await createFlight(harness, { isDemo: opts.isDemo, source: opts.isDemo ? 'demo' : 'manual' });
  const res = await a.post('/api/baggage', { description: 'Navy suitcase', color: 'Navy', weightKg: 20, flightId: String(flight._id) });
  expect(res.status).toBe(201);
  return res.body.baggage.reference;
}

beforeAll(async () => {
  await seedCheckpoints(false);
  await seedCheckpoints(true);
});

describe('baggage registration and ownership', () => {
  it('registers a bag with a non-sensitive reference and a QR code', async () => {
    const { agent: p } = await signedInAs(h, 'passenger');
    const ref = await registerBag(h, p);
    expect(ref).toMatch(/^AT-\d{4}-\d{6}$/);
    const qr = await p.get(`/api/baggage/${ref}/qr`);
    expect(qr.status).toBe(200);
    expect(parseQrPayload(qr.body.payload)).toBe(ref);
    expect(qr.body.svg).toContain('<svg');
    // The QR payload must not contain personal data.
    expect(qr.body.payload).not.toMatch(/passenger|@|Navy/i);
    const events = await p.get(`/api/baggage/${ref}/events`);
    expect(events.body.items).toHaveLength(1);
    expect(events.body.items[0].status).toBe('REGISTERED');
  });

  it("hides other passengers' bags (404) but lets staff view them", async () => {
    const { agent: owner } = await signedInAs(h, 'passenger');
    const { agent: other } = await signedInAs(h, 'passenger');
    const { agent: staff } = await signedInAs(h, 'staff');
    const ref = await registerBag(h, owner);
    expect((await other.get(`/api/baggage/${ref}`)).status).toBe(404);
    expect((await other.get(`/api/baggage/${ref}/qr`)).status).toBe(404);
    expect((await other.get('/api/baggage')).body.items.map((b) => b.reference)).not.toContain(ref);
    const staffView = await staff.get(`/api/baggage/${ref}`);
    expect(staffView.status).toBe(200);
    expect(staffView.body.allowedNext).toContain('CHECKED_IN');
  });

  it('rejects registration on cancelled flights', async () => {
    const { agent: p } = await signedInAs(h, 'passenger');
    const flight = await createFlight(h, { status: 'CANCELLED' });
    expect((await p.post('/api/baggage', { description: 'Bag', flightId: String(flight._id) })).status).toBe(400);
  });

  it('lets the owner delete a bag only before check-in', async () => {
    const { agent: p } = await signedInAs(h, 'passenger');
    const { agent: s } = await signedInAs(h, 'staff');
    const ref = await registerBag(h, p);
    await s.post('/api/scans', { reference: ref, checkpointCode: 'MAA-CHK' });
    expect((await p.delete(`/api/baggage/${ref}`)).status).toBe(409);
    const ref2 = await registerBag(h, p);
    expect((await p.delete(`/api/baggage/${ref2}`)).status).toBe(204);
  });
});

describe('QR scanning and status transitions', () => {
  it('records a full journey through every checkpoint and notifies the owner', async () => {
    const { agent: p, user } = await signedInAs(h, 'passenger');
    const { agent: s } = await signedInAs(h, 'staff');
    const ref = await registerBag(h, p);
    const qr = (await p.get(`/api/baggage/${ref}/qr`)).body.payload;
    for (const code of ['MAA-CHK', 'MAA-SEC', 'MAA-LOAD', 'MAA-DEP', 'DEL-ARR', 'DEL-BELT', 'DEL-EXIT']) {
      advance(h, 10);
      const res = await s.post('/api/scans', { qrPayload: qr, checkpointCode: code });
      expect(res.status, code).toBe(201);
      expect(res.body.findings).toEqual([]);
    }
    const bag = await p.get(`/api/baggage/${ref}`);
    expect(bag.body.baggage.status).toBe('COLLECTED');
    expect(bag.body.baggage.lastCheckpointName).toBe('DEL-EXIT');
    const events = (await p.get(`/api/baggage/${ref}/events`)).body.items;
    expect(events).toHaveLength(8);
    expect(events.every((e) => e.source === 'verified')).toBe(true);
    // Passengers do not see staff names.
    expect(events.every((e) => e.actorName === null)).toBe(true);
    const kinds = (await Notification.find({ user: user._id })).map((n) => n.kind);
    expect(kinds).toEqual(expect.arrayContaining(['ARRIVAL', 'READY_FOR_COLLECTION', 'STATUS_CHANGE']));
    // Email delivery outcome recorded honestly.
    expect((await Notification.findOne({ user: user._id })).email.status).toBe('sent');
  });

  it('treats a repeated scan as a duplicate without changing state', async () => {
    const { agent: p } = await signedInAs(h, 'passenger');
    const { agent: s } = await signedInAs(h, 'staff');
    const ref = await registerBag(h, p);
    expect((await s.post('/api/scans', { reference: ref, checkpointCode: 'MAA-CHK' })).status).toBe(201);
    const dup = await s.post('/api/scans', { reference: ref, checkpointCode: 'MAA-CHK' });
    expect(dup.status).toBe(200);
    expect(dup.body.outcome).toBe('duplicate');
    const bag = await Baggage.findOne({ reference: ref });
    expect(await BaggageEvent.countDocuments({ baggage: bag._id })).toBe(2);
    expect(await AnomalyAlert.countDocuments({ reference: ref, type: 'DUPLICATE_SCAN' })).toBe(1);
    // A third read does not create a second open alert.
    await s.post('/api/scans', { reference: ref, checkpointCode: 'MAA-CHK' });
    expect(await AnomalyAlert.countDocuments({ reference: ref, type: 'DUPLICATE_SCAN' })).toBe(1);
  });

  it('processes a retried request with the same idempotency key once', async () => {
    const { agent: p } = await signedInAs(h, 'passenger');
    const { agent: s } = await signedInAs(h, 'staff');
    const ref = await registerBag(h, p);
    const key = randomUUID();
    expect((await s.post('/api/scans', { reference: ref, checkpointCode: 'MAA-CHK', idempotencyKey: key })).status).toBe(201);
    advance(h, 5);
    const retry = await s.post('/api/scans', { reference: ref, checkpointCode: 'MAA-CHK', idempotencyKey: key });
    expect(retry.body.outcome).toBe('duplicate');
  });

  it('rejects backward transitions with 409 and an INVALID_SEQUENCE alert', async () => {
    const { agent: p } = await signedInAs(h, 'passenger');
    const { agent: s } = await signedInAs(h, 'staff');
    const ref = await registerBag(h, p);
    await s.post('/api/scans', { reference: ref, checkpointCode: 'MAA-CHK' });
    advance(h, 5);
    await s.post('/api/scans', { reference: ref, checkpointCode: 'MAA-SEC' });
    advance(h, 5);
    const back = await s.post('/api/scans', { reference: ref, checkpointCode: 'MAA-CHK' });
    expect(back.status).toBe(409);
    expect(back.body.error.code).toBe('INVALID_TRANSITION');
    expect((await Baggage.findOne({ reference: ref })).status).toBe('SECURITY_SCREENING');
    expect(await AnomalyAlert.countDocuments({ reference: ref, type: 'INVALID_SEQUENCE' })).toBe(1);
  });

  it('records a skipped security scan with a high-severity alert', async () => {
    const { agent: p } = await signedInAs(h, 'passenger');
    const { agent: s } = await signedInAs(h, 'staff');
    const ref = await registerBag(h, p);
    await s.post('/api/scans', { reference: ref, checkpointCode: 'MAA-CHK' });
    advance(h, 10);
    const res = await s.post('/api/scans', { reference: ref, checkpointCode: 'MAA-LOAD' });
    expect(res.status).toBe(201);
    const alert = await AnomalyAlert.findOne({ reference: ref, type: 'MISSING_CHECKPOINT' });
    expect(alert?.severity).toBe('high');
    expect(alert?.evidence).toMatchObject({ skipped: ['SECURITY_SCREENING'] });
  });

  it('flags an arrival scan at the wrong airport', async () => {
    const { agent: p } = await signedInAs(h, 'passenger');
    const { agent: s } = await signedInAs(h, 'staff');
    const ref = await registerBag(h, p);
    for (const code of ['MAA-CHK', 'MAA-SEC', 'MAA-LOAD', 'MAA-DEP', 'BOM-ARR']) {
      advance(h, 10);
      await s.post('/api/scans', { reference: ref, checkpointCode: code });
    }
    expect(await AnomalyAlert.countDocuments({ reference: ref, type: 'FLIGHT_MISMATCH' })).toBe(1);
  });

  it('rejects invalid QR codes and raises an alert after repeated failures', async () => {
    const { agent: s } = await signedInAs(h, 'staff');
    for (let i = 0; i < 3; i++) {
      const res = await s.post('/api/scans', { qrPayload: 'https://evil.example/qr', checkpointCode: 'MAA-SEC' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_QR');
    }
    expect(await AuditEvent.countDocuments({ action: 'scan.failed' })).toBeGreaterThanOrEqual(3);
    expect(await AnomalyAlert.countDocuments({ type: 'REPEATED_SCAN_FAILURES' })).toBe(1);
  });

  it('returns 404 for unknown references and 400 for unknown checkpoints', async () => {
    const { agent: s } = await signedInAs(h, 'staff');
    expect((await s.post('/api/scans', { reference: 'AT-ZZZZ-ZZZZ', checkpointCode: 'MAA-CHK' })).status).toBe(404);
    expect((await s.post('/api/scans', { reference: 'AT-ZZZZ-ZZZZ', checkpointCode: 'NOPE' })).status).toBe(400);
  });

  it('lets staff mark a bag delayed and resume, but not jump the main flow without a scan', async () => {
    const { agent: p } = await signedInAs(h, 'passenger');
    const { agent: s } = await signedInAs(h, 'staff');
    const ref = await registerBag(h, p);
    await s.post('/api/scans', { reference: ref, checkpointCode: 'MAA-CHK' });
    expect((await s.patch(`/api/baggage/${ref}/status`, { status: 'DELAYED', note: 'Conveyor fault' })).status).toBe(200);
    expect((await s.patch(`/api/baggage/${ref}/status`, { status: 'LOADED' })).body.error.code).toBe('SCAN_REQUIRED');
    advance(h, 5);
    const res = await s.post('/api/scans', { reference: ref, checkpointCode: 'MAA-SEC' });
    expect(res.status).toBe(201);
    expect(res.body.baggage.status).toBe('SECURITY_SCREENING');
    expect((await p.patch(`/api/baggage/${ref}/status`, { status: 'MISSING' })).status).toBe(403);
  });
});

describe('demo and operational separation', () => {
  it('refuses to scan demo bags at real checkpoints and vice versa', async () => {
    const { agent: p } = await signedInAs(h, 'passenger');
    const { agent: s } = await signedInAs(h, 'staff');
    const demoRef = await registerBag(h, p, { isDemo: true });
    const realRef = await registerBag(h, p);
    expect((await s.post('/api/scans', { reference: demoRef, checkpointCode: 'MAA-CHK' })).status).toBe(400);
    expect((await s.post('/api/scans', { reference: realRef, checkpointCode: 'DEMO-MAA-CHK' })).status).toBe(400);
    const ok = await s.post('/api/scans', { reference: demoRef, checkpointCode: 'DEMO-MAA-CHK' });
    expect(ok.status).toBe(201);
    const events = (await p.get(`/api/baggage/${demoRef}/events`)).body.items;
    expect(events.every((e) => e.source === 'simulated')).toBe(true);
  });

  it('seeds and resets demo data without touching operational records', async () => {
    const { agent: admin } = await signedInAs(h, 'admin');
    const { agent: p } = await signedInAs(h, 'passenger');
    const realRef = await registerBag(h, p);
    const realCount = await Baggage.countDocuments({ isDemo: false });
    // Bags real users put on sample flights are labelled demo but are not part of the generated dataset.
    const userDemoBags = await Baggage.countDocuments({ isDemo: true });
    const seeded = await admin.post('/api/demo/seed');
    expect(seeded.status).toBe(201);
    expect(await Baggage.countDocuments({ isDemo: true })).toBeGreaterThanOrEqual(7);
    expect(await AnomalyAlert.countDocuments({ isDemo: true, type: 'MISSING_CHECKPOINT' })).toBeGreaterThan(0);
    // Default analytics scope is operational only.
    const ops = await admin.get('/api/admin/analytics');
    expect(ops.body.kpis.totalBaggage).toBe(realCount);
    const demo = await admin.get('/api/admin/analytics?scope=demo');
    expect(demo.body.kpis.totalBaggage).toBeGreaterThanOrEqual(7);
    // The walkthrough tag exists with a fixed ID and is found by staff lookup; re-seeding does not duplicate it.
    expect((await admin.get('/api/baggage/AT-2026-100245')).body.baggage).toMatchObject({ reference: 'AT-2026-100245', status: 'LOADED', isDemo: true });
    expect((await admin.post('/api/demo/seed')).status).toBe(201);
    expect(await Baggage.countDocuments({ reference: 'AT-2026-100245' })).toBe(1);

    const reset = await admin.post('/api/demo/reset');
    expect(reset.status).toBe(200);
    expect(await Baggage.countDocuments({ isDemo: true })).toBe(userDemoBags);
    expect(await BaggageEvent.countDocuments({ isDemo: true, actorRole: 'staff' })).toBe(0);
    expect(await Baggage.countDocuments({ isDemo: false })).toBe(realCount);
    expect((await p.get(`/api/baggage/${realRef}`)).status).toBe(200);
  });
});

describe('anomaly sweep and delay prediction', () => {
  it('raises a missing-scan alert once for a bag that goes quiet and reports elevated risk', async () => {
    const { agent: p } = await signedInAs(h, 'passenger');
    const { agent: s } = await signedInAs(h, 'staff');
    const ref = await registerBag(h, p);
    await s.post('/api/scans', { reference: ref, checkpointCode: 'MAA-CHK' });
    const early = (await p.get(`/api/baggage/${ref}/prediction`)).body.prediction;
    expect(early.method).toBe('rules-baseline');
    expect(early.level).toBe('low');

    advance(h, 130);
    await runAnomalySweep(h.ctx);
    await runAnomalySweep(h.ctx);
    expect(await AnomalyAlert.countDocuments({ reference: ref, type: 'MISSING_SCAN_TIMEOUT' })).toBe(1);
    const late = (await p.get(`/api/baggage/${ref}/prediction`)).body.prediction;
    expect(late.risk).toBeGreaterThan(early.risk);
    expect(late.factors.length).toBeGreaterThan(0);
    expect(late.disclaimer).toMatch(/not trained/i);
  });

  it('lets staff acknowledge and resolve alerts with a history trail', async () => {
    const { agent: s } = await signedInAs(h, 'staff');
    const list = await s.get('/api/alerts?status=ACTIVE');
    expect(list.status).toBe(200);
    const alert = list.body.items[0];
    expect(alert).toBeTruthy();
    expect(alert.reason).toBeTruthy();
    expect(alert.recommendedAction).toBeTruthy();
    await s.patch(`/api/alerts/${alert.id}`, { status: 'ACKNOWLEDGED' });
    const done = await s.patch(`/api/alerts/${alert.id}`, { status: 'RESOLVED', note: 'Bag located at belt 2' });
    expect(done.body.alert.status).toBe('RESOLVED');
    expect(done.body.alert.history).toHaveLength(2);
  });
});

describe('operations board and admin corrections', () => {
  it('moves a bag one validated step at a time, server-confirmed, and refuses skips', async () => {
    const { agent: p } = await signedInAs(h, 'passenger');
    const { agent: s } = await signedInAs(h, 'staff');
    const ref = await registerBag(h, p);

    const board = await s.get('/api/baggage/board?scope=all');
    expect(board.status).toBe(200);
    expect(board.body.items.some((b) => b.reference === ref)).toBe(true);
    expect((await p.get('/api/baggage/board')).status).toBe(403);

    const skip = await s.patch(`/api/baggage/${ref}/status`, { status: 'LOADED', source: 'board' });
    expect(skip.status).toBe(409);
    const ok = await s.patch(`/api/baggage/${ref}/status`, { status: 'CHECKED_IN', source: 'board' });
    expect(ok.status).toBe(200);
    expect(ok.body.baggage.status).toBe('CHECKED_IN');
    expect(ok.body.event.previousStatus).toBe('REGISTERED');
    const back = await s.post(`/api/baggage/${ref}/events`, { status: 'REGISTERED' });
    expect(back.status).toBe(409);
    expect((await p.patch(`/api/baggage/${ref}/status`, { status: 'SECURITY_SCREENING' })).status).toBe(403);

    // A stale version (If-Match) is refused instead of overwriting a newer change.
    const stale = await s.patch(`/api/baggage/${ref}/status`, { status: 'SECURITY_SCREENING' }).set('If-Match', '0');
    expect(stale.status).toBe(409);

    const events = await p.get(`/api/baggage/${ref}/events`);
    expect(events.body.items.map((e) => e.status)).toEqual(['REGISTERED', 'CHECKED_IN']);
    expect(await BaggageEvent.countDocuments({ method: 'board' })).toBeGreaterThan(0);
  });

  it('lets only admins override a status, with a reason, and audits it', async () => {
    const { agent: p } = await signedInAs(h, 'passenger');
    const { agent: s } = await signedInAs(h, 'staff');
    const { agent: a } = await signedInAs(h, 'admin');
    const ref = await registerBag(h, p);
    await s.patch(`/api/baggage/${ref}/status`, { status: 'CHECKED_IN' });

    expect((await s.post(`/api/baggage/${ref}/override`, { status: 'REGISTERED', reason: 'Checked in by mistake at wrong desk' })).status).toBe(403);
    expect((await a.post(`/api/baggage/${ref}/override`, { status: 'REGISTERED', reason: 'oops' })).status).toBe(400);
    const res = await a.post(`/api/baggage/${ref}/override`, { status: 'REGISTERED', reason: 'Checked in by mistake at wrong desk' });
    expect(res.status).toBe(200);
    expect(res.body.baggage).toMatchObject({ status: 'REGISTERED', lastMainStatus: 'REGISTERED' });
    const audit = await AuditEvent.findOne({ action: 'baggage.override', targetId: ref }).lean();
    expect(audit?.meta).toMatchObject({ from: 'CHECKED_IN', to: 'REGISTERED' });

    const stats = await a.get('/api/admin/stats?scope=all');
    expect(stats.status).toBe(200);
    expect(stats.body.totalBags).toBeGreaterThan(0);
    expect((await s.get('/api/admin/stats')).status).toBe(403);
    expect((await a.get('/api/admin/audit-logs')).body.items.length).toBeGreaterThan(0);
  });

  it('returns Baggage Not Found for unknown IDs', async () => {
    const { agent: s } = await signedInAs(h, 'staff');
    const res = await s.get('/api/baggage/AT-2026-999999');
    expect(res.status).toBe(404);
    expect((await s.get('/api/baggage/not-a-tag')).status).toBe(404);
  });
});
