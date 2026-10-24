import { describe, expect, it, beforeAll } from 'vitest';
import request from 'supertest';
import { AIRLINE_DIRECTORY, sampleFlights } from '@aerotrack/shared';
import { Airline, Flight, Incident, Notification } from '../models/index.js';
import { ensureDirectory, seedDemoFlights } from '../services/flights.js';
import { createFlight, seedCheckpoints, signedInAs, useTestApp } from './helpers.js';
import { loadEnv, redactMongoUri } from '../config/env.js';

const h = useTestApp('services');

beforeAll(async () => {
  await seedCheckpoints(false);
});

async function bagFor(a) {
  const flight = await createFlight(h);
  const res = await a.post('/api/baggage', { description: 'Grey duffel', flightId: String(flight._id) });
  return res.body.baggage.reference;
}

describe('incidents', () => {
  it('lets a passenger report, staff investigate and resolve, with notifications and history', async () => {
    const { agent: p, user } = await signedInAs(h, 'passenger');
    const { agent: s } = await signedInAs(h, 'staff');
    const { agent: other } = await signedInAs(h, 'passenger');
    const ref = await bagFor(p);

    const created = await p.post('/api/incidents', { reference: ref, type: 'DAMAGED', description: 'Handle broken on arrival.' });
    expect(created.status).toBe(201);
    const id = created.body.incident.id;
    expect((await p.get(`/api/baggage/${ref}`)).body.baggage.status).toBe('INCIDENT_REPORTED');

    // Duplicate open incident of the same type is refused.
    expect((await p.post('/api/incidents', { reference: ref, type: 'DAMAGED', description: 'Handle broken again.' })).status).toBe(409);
    // Other passengers cannot see it or report against the bag.
    expect((await other.get(`/api/incidents/${id}`)).status).toBe(404);
    expect((await other.post('/api/incidents', { reference: ref, type: 'MISSING', description: 'Not my bag at all.' })).status).toBe(404);
    // Passengers cannot add staff notes.
    expect((await p.post(`/api/incidents/${id}/notes`, { text: 'hi' })).status).toBe(403);

    await s.post(`/api/incidents/${id}/notes`, { text: 'Inspecting at belt office.', status: 'INVESTIGATING' });
    const resolved = await s.post(`/api/incidents/${id}/notes`, { text: 'Repair voucher issued.', status: 'RESOLVED' });
    expect(resolved.body.incident.status).toBe('RESOLVED');
    expect(resolved.body.incident.history).toHaveLength(3);
    const mine = await p.get('/api/incidents');
    expect(mine.body.items[0].status).toBe('RESOLVED');
    expect(await Notification.countDocuments({ user: user._id, kind: 'INCIDENT_UPDATE' })).toBe(2);
    expect(await Incident.countDocuments()).toBe(1);
  });
});

describe('notifications', () => {
  it('records email delivery failures instead of claiming success', async () => {
    const { agent: p, user } = await signedInAs(h, 'passenger');
    const { agent: s } = await signedInAs(h, 'staff');
    const ref = await bagFor(p);
    h.email.fail = true;
    try {
      await s.post('/api/scans', { reference: ref, checkpointCode: 'MAA-CHK' });
    } finally {
      h.email.fail = false;
    }
    const n = await Notification.findOne({ user: user._id, kind: 'STATUS_CHANGE' });
    expect(n?.email?.status).toBe('failed');
    expect(n?.email?.error).toMatch(/simulated/);
  });

  it('respects the email opt-out and lists/marks notifications read', async () => {
    const { agent: p, user } = await signedInAs(h, 'passenger');
    const { agent: s } = await signedInAs(h, 'staff');
    await p.patch('/api/users/me', { preferences: { emailNotifications: false } });
    const ref = await bagFor(p);
    const sentBefore = h.email.sent.length;
    await s.post('/api/scans', { reference: ref, checkpointCode: 'MAA-CHK' });
    expect(h.email.sent.length).toBe(sentBefore);
    const list = await p.get('/api/notifications');
    expect(list.body.unread).toBe(1);
    expect(list.body.items[0].emailStatus).toBe('skipped');
    await p.post('/api/notifications/read', { all: true });
    expect((await p.get('/api/notifications')).body.unread).toBe(0);
    expect(await Notification.countDocuments({ user: user._id })).toBe(1);
  });
});

describe('airline directory and sample flights', () => {
  it('seeds the directory idempotently and serves it publicly', async () => {
    await ensureDirectory(h.clock.now);
    await ensureDirectory(h.clock.now);
    await seedDemoFlights(h.clock.now);
    expect(await Airline.countDocuments()).toBe(AIRLINE_DIRECTORY.length);
    expect(await Flight.countDocuments({ isDemo: true, source: 'demo' })).toBe(sampleFlights(h.clock.now).length);

    const list = await request(h.app).get('/api/airlines');
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(20);
    expect(list.body.notice).toMatch(/Demonstration directory/);
    const ai = list.body.items.find((a) => a.code === 'AI');
    expect(ai).toMatchObject({ name: 'Air India', country: 'India', region: 'South Asia' });

    expect(ai.featuredFlight).toMatchObject({ flightNumber: 'AI573', origin: 'MAA', destination: 'BOM', isDemo: true });
    expect(ai.featuredFlight.gate).toBeTruthy();
    expect(list.body.items.map((a) => a.code)).not.toContain('UK'); // Vistara is historical

    const filtered = await request(h.app).get('/api/airlines?region=Southeast%20Asia&search=airasia');
    expect(filtered.body.items.map((a) => a.code)).toEqual(['AK']);

    const detail = await request(h.app).get('/api/airlines/ai');
    expect(detail.body.airline.name).toBe('Air India');
    expect(detail.body.flights.length).toBeGreaterThan(0);
    expect(detail.body.flights.every((f) => f.isDemo && f.source === 'demo')).toBe(true);
    expect((await request(h.app).get('/api/airlines/ZZ')).status).toBe(404);
  });

  it('lets staff add manual flights with validation', async () => {
    const { agent: s } = await signedInAs(h, 'staff');
    const bad = await s.post('/api/flights', {
      airlineCode: 'AI',
      airlineName: 'Air India',
      flightNumber: 'AI1',
      origin: 'MAA',
      destination: 'MAA',
      scheduledDeparture: '2026-03-02T10:00:00Z',
      scheduledArrival: '2026-03-02T09:00:00Z',
    });
    expect(bad.status).toBe(400);
    const ok = await s.post('/api/flights', {
      airlineCode: 'AI',
      airlineName: 'Air India',
      flightNumber: 'AI1',
      origin: 'MAA',
      destination: 'DEL',
      scheduledDeparture: '2026-03-02T10:00:00Z',
      scheduledArrival: '2026-03-02T12:45:00Z',
    });
    expect(ok.status).toBe(201);
    expect(ok.body.flight.source).toBe('manual');
    expect(await Flight.countDocuments({ flightNumber: 'AI1' })).toBe(1);
  });
});

describe('configuration and health', () => {
  it('rejects placeholder Mongo URIs and never echoes secret values', () => {
    const base = { SESSION_SECRET: 'x'.repeat(32) };
    expect(() => loadEnv({ ...base, MONGODB_URI: 'mongodb+srv://user:<db_password>@cluster.example.net/' })).toThrow(/placeholder/);
    try {
      loadEnv({ ...base, MONGODB_URI: 'mongodb+srv://user:SuperSecret@cluster.example.net/', SESSION_SECRET: 'short' });
    } catch (e) {
      expect(e.message).not.toContain('SuperSecret');
      expect(e.message).toContain('SESSION_SECRET');
    }
    expect(() => loadEnv({ ...base, MONGODB_URI: 'mongodb://x', NODE_ENV: 'production', EMAIL_PROVIDER: 'dev' })).toThrow(/dev email mode/);
    expect(redactMongoUri('mongodb+srv://user:SuperSecret@cluster.example.net/db')).toBe('mongodb+srv://***:***@cluster.example.net/db');
  });

  it('reports health with modes only', async () => {
    const res = await request(h.app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.database.ping).toBe(true);
    expect(res.body.delayModel.method).toBe('rules-baseline');
    expect(JSON.stringify(res.body)).not.toMatch(/mongodb/);
  });

  it('sets security headers', async () => {
    const res = await request(h.app).get('/api/health/live');
    expect(res.headers['content-security-policy']).toBeTruthy();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('refuses CORS for unknown origins', async () => {
    const res = await request(h.app).options('/api/auth/me').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'POST');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    const ok = await request(h.app).options('/api/auth/me').set('Origin', 'http://localhost:5173').set('Access-Control-Request-Method', 'POST');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });
});
