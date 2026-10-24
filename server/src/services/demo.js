import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { generateReference, MAIN_FLOW } from '@aerotrack/shared';

import { AnomalyAlert, AuditEvent, Baggage, BaggageEvent, Checkpoint, Incident, Notification, PredictionRecord, User } from '../models/index.js';
import { seedDemoFlights } from './flights.js';
import { processScan } from './tracking.js';

/**
 * Demo data lives alongside operational data but is always flagged
 * `isDemo: true` and uses `demo.*@aerotrack.invalid` accounts and DEMO-*
 * checkpoints. Reset removes exactly those records and nothing else.
 */
export const DEMO_CHECKPOINTS = [
  { code: 'DEMO-MAA-CHK', name: 'DEMO Chennai check-in', airport: 'MAA', type: 'CHECKIN_COUNTER' },
  { code: 'DEMO-MAA-SEC', name: 'DEMO Chennai security', airport: 'MAA', type: 'SECURITY' },
  { code: 'DEMO-MAA-LOAD', name: 'DEMO Chennai loading', airport: 'MAA', type: 'LOADING' },
  { code: 'DEMO-MAA-DEP', name: 'DEMO Chennai departure', airport: 'MAA', type: 'DEPARTURE' },
  { code: 'DEMO-DEL-ARR', name: 'DEMO Delhi arrival', airport: 'DEL', type: 'ARRIVAL' },
  { code: 'DEMO-DEL-BELT', name: 'DEMO Delhi belt 4', airport: 'DEL', type: 'BELT' },
  { code: 'DEMO-DEL-EXIT', name: 'DEMO Delhi collection', airport: 'DEL', type: 'COLLECTION' },
  { code: 'DEMO-BOM-ARR', name: 'DEMO Mumbai arrival', airport: 'BOM', type: 'ARRIVAL' },
];

const stageCheckpoint = {
  CHECKED_IN: 'DEMO-MAA-CHK',
  SECURITY_SCREENING: 'DEMO-MAA-SEC',
  LOADED: 'DEMO-MAA-LOAD',
  IN_TRANSIT: 'DEMO-MAA-DEP',
  ARRIVED: 'DEMO-DEL-ARR',
  ON_BELT: 'DEMO-DEL-BELT',
  COLLECTED: 'DEMO-DEL-EXIT',
};

async function demoUser(email, name, role) {
  const existing = await User.findOne({ email });
  if (existing) return existing;
  // Random unusable password: demo accounts cannot be signed into.
  const passwordHash = await bcrypt.hash(randomBytes(24).toString('hex'), 10);
  return User.create({ email, name, role, passwordHash, emailVerified: true, isDemo: true, preferences: { emailNotifications: false } });
}

export async function resetDemo() {
  // Only the generated demo dataset is removed. Sample flights stay, as do bags
  // that real users registered on them.
  const demoUsers = await User.find({ isDemo: true }, { _id: 1 });
  const demoBags = await Baggage.find({ isDemo: true, owner: { $in: demoUsers.map((u) => u._id) } }, { _id: 1 });
  const ids = demoBags.map((b) => b._id);
  const [events, incidents, alerts, notifications, predictions, bags, checkpoints, audits, users] = await Promise.all([
    BaggageEvent.deleteMany({ $or: [{ isDemo: true }, { baggage: { $in: ids } }] }),
    Incident.deleteMany({ $or: [{ isDemo: true }, { baggage: { $in: ids } }] }),
    AnomalyAlert.deleteMany({ $or: [{ isDemo: true }, { baggage: { $in: ids } }] }),
    Notification.deleteMany({ isDemo: true }),
    PredictionRecord.deleteMany({ $or: [{ isDemo: true }, { baggage: { $in: ids } }] }),
    Baggage.deleteMany({ _id: { $in: ids } }),
    Checkpoint.deleteMany({ isDemo: true }),
    AuditEvent.deleteMany({ isDemo: true }),
    User.deleteMany({ isDemo: true }),
  ]);
  return {
    baggage: bags.deletedCount,
    events: events.deletedCount,
    incidents: incidents.deletedCount,
    alerts: alerts.deletedCount,
    notifications: notifications.deletedCount,
    predictions: predictions.deletedCount,
    checkpoints: checkpoints.deletedCount,
    auditEvents: audits.deletedCount,
    users: users.deletedCount,
  };
}

/** Create a small, clearly labelled demo dataset by running real scans through the tracking service. */
export async function seedDemo(ctx) {
  await resetDemo();
  const now = ctx.now();
  for (const c of DEMO_CHECKPOINTS) await Checkpoint.create({ ...c, isDemo: true });
  const flights = await seedDemoFlights(now);
  const passenger = await demoUser('demo.passenger@aerotrack.invalid', 'Demo Passenger', 'passenger');
  const staff = await demoUser('demo.staff@aerotrack.invalid', 'Demo Staff', 'staff');
  const flight = flights.find((f) => f.flightNumber === 'AI904'); // sample MAA→DEL leg

  // Fixed demo tag IDs so the walkthrough is repeatable (e.g. look up AT-2026-100245).
  const plan = [
    { ref: 'AT-2026-100241', description: 'Navy hard-shell suitcase', color: 'Navy', upTo: 'COLLECTED' },
    { ref: 'AT-2026-100242', description: 'Red cabin trolley', color: 'Red', upTo: 'ON_BELT' },
    { ref: 'AT-2026-100245', description: 'Black duffel bag', color: 'Black', upTo: 'LOADED' },
    { ref: 'AT-2026-100243', description: 'Grey backpack', color: 'Grey', upTo: 'CHECKED_IN' },
    { ref: 'AT-2026-100246', description: 'Green suitcase (missing-checkpoint scenario)', color: 'Green', upTo: 'SKIP_SECURITY' },
    { ref: 'AT-2026-100247', description: 'Blue suitcase (misrouted scenario)', color: 'Blue', upTo: 'WRONG_AIRPORT' },
    { ref: 'AT-2026-100244', description: 'Silver suitcase', color: 'Silver', upTo: 'REGISTERED' },
  ];

  // Scans are time-shifted so the timeline looks like a real journey.
  let clock = now.getTime() - 4 * 3600_000;
  const scanCtx = { ...ctx, now: () => new Date(clock) };
  const created = [];
  for (const p of plan) {
    const bag = await Baggage.create({
      // Never take over a real bag's reference: fall back to a random one if it is in use.
      reference: (await Baggage.exists({ reference: p.ref })) ? generateReference((n) => randomBytes(n)) : p.ref,
      owner: passenger._id,
      flight: flight._id,
      description: p.description,
      color: p.color,
      weightKg: 18,
      isDemo: true,
    });
    created.push(bag);
    await BaggageEvent.create({
      baggage: bag._id,
      status: 'REGISTERED',
      actor: passenger._id,
      actorRole: 'passenger',
      method: 'system',
      note: 'Registered (demo)',
      source: 'simulated',
      occurredAt: new Date(clock),
      isDemo: true,
    });
    const steps = [];
    if (p.upTo === 'SKIP_SECURITY') steps.push({ code: 'DEMO-MAA-CHK' }, { code: 'DEMO-MAA-LOAD' });
    else if (p.upTo === 'WRONG_AIRPORT') steps.push({ code: 'DEMO-MAA-CHK' }, { code: 'DEMO-MAA-SEC' }, { code: 'DEMO-MAA-LOAD' }, { code: 'DEMO-MAA-DEP' }, { code: 'DEMO-BOM-ARR' });
    else {
      const last = MAIN_FLOW.indexOf(p.upTo);
      for (const s of MAIN_FLOW.slice(1, last + 1)) steps.push({ code: stageCheckpoint[s] });
    }
    for (const s of steps) {
      clock += 7 * 60_000;
      await processScan(scanCtx, staff, { reference: bag.reference, checkpointCode: s.code });
    }
  }

  // One demo incident.
  const delayedBag = created[2];
  await Incident.create({
    baggage: delayedBag._id,
    reporter: passenger._id,
    type: 'DELAYED',
    description: 'DEMO: Passenger reports the bag was not on the expected belt.',
    isDemo: true,
    history: [{ by: passenger._id, byName: passenger.name, text: 'Incident reported (demo).', status: 'OPEN', at: now }],
  });
  return { baggage: created.length, flights: flights.length, checkpoints: DEMO_CHECKPOINTS.length };
}
