import { inject, afterAll, beforeAll } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../app.js';
import { loadEnv } from '../config/env.js';

import { User, Checkpoint, Flight } from '../models/index.js';
import bcrypt from 'bcryptjs';

export class FakeEmail {
  mode = 'smtp';
  sent = [];
  fail = false;
  async send(msg) {
    if (this.fail) return { status: 'failed', error: 'simulated provider failure' };
    this.sent.push(msg);
    return { status: 'sent', provider: 'smtp' };
  }
  /** Latest 6-digit code emailed to `to` (optionally for a subject containing `kind`). */
  lastCodeFor(to, kind = '') {
    const msg = [...this.sent].reverse().find((m) => m.to === to && m.subject.includes(kind));
    return msg?.text.match(/code is (\d{6})/)?.[1];
  }
}

/**
 * Create every schema index. Unique indexes matter for the tests (dedupe,
 * idempotency). TTL indexes only affect retention, so a MongoDB-compatible
 * test server that lacks TTL support (e.g. FerretDB) may skip them.
 */
async function createIndexes() {
  for (const model of Object.values(mongoose.models)) {
    await model.createCollection();
    for (const [fields, options] of model.schema.indexes()) {
      try {
        await model.collection.createIndex(fields, { background: false, ...options });
      } catch (err) {
        if (!('expireAfterSeconds' in (options ?? {})) || !/not implemented/i.test(err.message)) throw err;
      }
    }
  }
}

/** Each test file gets its own database, dropped afterwards. */
export function useTestApp(name) {
  const email = new FakeEmail();
  const clock = { now: new Date('2026-03-01T08:00:00Z') };
  const env = loadEnv({
    NODE_ENV: 'test',
    MONGODB_URI: inject('mongoUri'),
    MONGODB_DB_NAME: `aerotrack_test_${name}`,
    SESSION_SECRET: 'test-secret-test-secret-test-secret-123',
    CLIENT_URL: 'http://localhost:5173',
    EMAIL_PROVIDER: 'none',
    ANOMALY_SWEEP_INTERVAL_MIN: '0',
  });
  const ctx = { env, email, delayModel: null, now: () => new Date(clock.now) };
  const h = { ctx, email, clock, app: createApp(ctx, { disableRateLimit: true }) };

  beforeAll(async () => {
    await mongoose.connect(env.MONGODB_URI, { dbName: env.MONGODB_DB_NAME, autoIndex: false });
    await mongoose.connection.db.dropDatabase();
    await createIndexes();
  });
  afterAll(async () => {
    await mongoose.connection.db?.dropDatabase();
    await mongoose.disconnect();
  });
  return h;
}

/** Supertest agent that keeps cookies and sends the CSRF header. */
export function agent(h) {
  const a = request.agent(h.app);
  const wrap = {
    get: (url) => a.get(url),
    post: (url, body) =>
      a
        .post(url)
        .set('X-Requested-With', 'aerotrack')
        .send(body ?? {}),
    patch: (url, body) =>
      a
        .patch(url)
        .set('X-Requested-With', 'aerotrack')
        .send(body ?? {}),
    delete: (url) => a.delete(url).set('X-Requested-With', 'aerotrack'),
  };
  return wrap;
}

let counter = 0;
/** Create a user directly and sign in. */
export async function signedInAs(h, role, opts = {}) {
  const email = `${role}${++counter}@example.com`;
  const password = 'correct-horse-42';
  const user = await User.create({ name: `${role} ${counter}`, email, role, emailVerified: opts.verified ?? true, passwordHash: await bcrypt.hash(password, 4) });
  const a = agent(h);
  const res = await a.post('/api/auth/login', { email, password });
  if (res.status !== 200) throw new Error(`login failed: ${res.status}`);
  return { agent: a, user, email, password };
}

export async function seedCheckpoints(isDemo = false) {
  const prefix = isDemo ? 'DEMO-' : '';
  const rows = [
    ['MAA-CHK', 'MAA', 'CHECKIN_COUNTER'],
    ['MAA-SEC', 'MAA', 'SECURITY'],
    ['MAA-LOAD', 'MAA', 'LOADING'],
    ['MAA-DEP', 'MAA', 'DEPARTURE'],
    ['DEL-ARR', 'DEL', 'ARRIVAL'],
    ['BOM-ARR', 'BOM', 'ARRIVAL'],
    ['DEL-BELT', 'DEL', 'BELT'],
    ['DEL-EXIT', 'DEL', 'COLLECTION'],
  ];
  for (const [code, airport, type] of rows) {
    await Checkpoint.updateOne({ code: prefix + code }, { $setOnInsert: { code: prefix + code, name: `${prefix}${code}`, airport, type, isDemo } }, { upsert: true });
  }
}

export async function createFlight(h, overrides = {}) {
  const dep = new Date(h.clock.now.getTime() + (overrides.departureInMin ?? 180) * 60000);
  return Flight.create({
    airlineCode: 'AI',
    airlineName: 'Air India',
    flightNumber: overrides.flightNumber ?? `AI${100 + ++counter}`,
    origin: 'MAA',
    destination: 'DEL',
    scheduledDeparture: dep,
    scheduledArrival: new Date(dep.getTime() + 165 * 60000),
    status: overrides.status ?? 'SCHEDULED',
    source: overrides.source ?? 'manual',
    isDemo: overrides.isDemo ?? false,
  });
}

export const advance = (h, minutes) => {
  h.clock.now = new Date(h.clock.now.getTime() + minutes * 60000);
};
