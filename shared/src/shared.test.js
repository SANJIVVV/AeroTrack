import { describe, expect, it } from 'vitest';
import {
  advanceSim,
  allowedNextStatuses,
  baselineRisk,
  buildFeatures,
  checkTransition,
  evaluateDwell,
  evaluateScan,
  evaluateScanFailures,
  generateReference,
  initialSimState,
  isLogisticModel,
  logisticRisk,
  normalizeReference,
  parseQrPayload,
  parseLookupInput,
  toQrPayload,
  SIM_DURATION_MIN,
  REFERENCE_PATTERN,
} from './index.js';

describe('status transitions', () => {
  it('allows forward moves and reports skipped checkpoints', () => {
    expect(checkTransition('REGISTERED', 'CHECKED_IN', 'REGISTERED')).toEqual({ ok: true, skipped: [] });
    expect(checkTransition('CHECKED_IN', 'LOADED', 'CHECKED_IN')).toEqual({ ok: true, skipped: ['SECURITY_SCREENING'] });
  });
  it('rejects backward, same and post-collection moves', () => {
    expect(checkTransition('LOADED', 'CHECKED_IN', 'LOADED')).toEqual({ ok: false, reason: 'BACKWARD' });
    expect(checkTransition('LOADED', 'LOADED', 'LOADED')).toEqual({ ok: false, reason: 'SAME_STATUS' });
    expect(checkTransition('COLLECTED', 'ON_BELT', 'COLLECTED')).toEqual({ ok: false, reason: 'TERMINAL' });
    expect(checkTransition('COLLECTED', 'INCIDENT_REPORTED', 'COLLECTED').ok).toBe(true);
  });
  it('resumes from exception statuses at or after the last main status', () => {
    expect(checkTransition('DELAYED', 'LOADED', 'LOADED').ok).toBe(true);
    expect(checkTransition('DELAYED', 'IN_TRANSIT', 'LOADED').ok).toBe(true);
    expect(checkTransition('DELAYED', 'CHECKED_IN', 'LOADED')).toEqual({ ok: false, reason: 'BACKWARD' });
  });
  it('lists allowed next statuses', () => {
    const next = allowedNextStatuses('ON_BELT', 'ON_BELT');
    expect(next).toContain('COLLECTED');
    expect(next).not.toContain('ARRIVED');
  });
});

describe('QR references', () => {
  it('generates references matching the pattern and round-trips payloads', () => {
    const ref = generateReference((n) => Uint8Array.from({ length: n }, (_, i) => i * 37));
    expect(ref).toMatch(REFERENCE_PATTERN);
    expect(parseQrPayload(toQrPayload(ref))).toBe(ref);
  });
  it('rejects foreign or malformed payloads', () => {
    expect(parseQrPayload('https://example.com')).toBeNull();
    expect(parseQrPayload('AEROTRACK:BAG:AT-ABCD-EFGI')).toBeNull(); // I is not in the alphabet
    expect(parseQrPayload('AEROTRACK:BAG:AT-ABCD-EFGH;DROP')).toBeNull();
  });
  it('normalises manual entry', () => {
    expect(normalizeReference(' at-abcd-efgh ')).toBe('AT-ABCD-EFGH');
    expect(normalizeReference('ABCDEFGH')).toBe('AT-ABCD-EFGH');
    expect(normalizeReference('AT-ABC')).toBeNull();
    expect(normalizeReference('at 2026 100245')).toBe('AT-2026-100245');
    expect(normalizeReference('AT2026100245')).toBe('AT-2026-100245');
  });
  it('generates year-based references', () => {
    expect(generateReference(() => new Uint8Array([0, 1, 134, 160]), 2026)).toBe('AT-2026-100000');
  });
  it('parses pasted QR content, plain IDs and trusted tracking links only', () => {
    const trusted = ['https://aerotrack.example'];
    expect(parseLookupInput('AEROTRACK:BAG:AT-2026-100245', trusted)).toEqual({ ok: true, reference: 'AT-2026-100245', via: 'qr-payload' });
    expect(parseLookupInput(' at-2026-100245 ', trusted)).toEqual({ ok: true, reference: 'AT-2026-100245', via: 'reference' });
    expect(parseLookupInput('https://aerotrack.example/track/AT-2026-100245', trusted)).toEqual({ ok: true, reference: 'AT-2026-100245', via: 'url' });
    expect(parseLookupInput('https://evil.example/track/AT-2026-100245', trusted)).toEqual({ ok: false, reason: 'UNTRUSTED_URL' });
    expect(parseLookupInput('https://aerotrack.example/admin', trusted)).toEqual({ ok: false, reason: 'INVALID' });
    expect(parseLookupInput('javascript:alert(1)', trusted)).toEqual({ ok: false, reason: 'INVALID' });
    expect(parseLookupInput('', trusted)).toEqual({ ok: false, reason: 'EMPTY' });
  });
});

describe('anomaly rules', () => {
  const now = new Date('2026-01-01T10:00:00Z');
  const checkpoint = { code: 'MAA-SEC-1', type: 'SECURITY', airport: 'MAA' };
  const flight = { origin: 'MAA', destination: 'DEL' };

  it('flags duplicate scans and does not record them', () => {
    const r = evaluateScan({
      bag: { status: 'SECURITY_SCREENING', lastMainStatus: 'SECURITY_SCREENING' },
      checkpoint,
      flight,
      recentEvents: [{ status: 'SECURITY_SCREENING', checkpointCode: 'MAA-SEC-1', occurredAt: new Date(now.getTime() - 30000) }],
      now,
    });
    expect(r.action).toBe('duplicate');
    expect(r.findings[0]?.type).toBe('DUPLICATE_SCAN');
  });
  it('rejects backward sequences with an INVALID_SEQUENCE finding', () => {
    const r = evaluateScan({ bag: { status: 'LOADED', lastMainStatus: 'LOADED' }, checkpoint, flight, recentEvents: [], now });
    expect(r.action).toBe('reject');
    expect(r.findings[0]?.type).toBe('INVALID_SEQUENCE');
  });
  it('records skipped security as a high-severity missing checkpoint', () => {
    const r = evaluateScan({
      bag: { status: 'CHECKED_IN', lastMainStatus: 'CHECKED_IN' },
      checkpoint: { code: 'MAA-LOAD-1', type: 'LOADING', airport: 'MAA' },
      flight,
      recentEvents: [],
      now,
    });
    expect(r.action).toBe('record');
    expect(r.findings).toEqual([expect.objectContaining({ type: 'MISSING_CHECKPOINT', severity: 'high' })]);
  });
  it('flags scans at an airport that does not match the flight', () => {
    const r = evaluateScan({
      bag: { status: 'IN_TRANSIT', lastMainStatus: 'IN_TRANSIT' },
      checkpoint: { code: 'BOM-ARR-1', type: 'ARRIVAL', airport: 'BOM' },
      flight,
      recentEvents: [],
      now,
    });
    expect(r.findings.map((f) => f.type)).toContain('FLIGHT_MISMATCH');
  });
  it('detects prolonged dwell and missing-scan timeouts', () => {
    const at = (min) => new Date(now.getTime() - min * 60000);
    expect(evaluateDwell({ status: 'CHECKED_IN', lastMainStatus: 'CHECKED_IN', lastScanAt: at(10) }, now)).toBeNull();
    expect(evaluateDwell({ status: 'CHECKED_IN', lastMainStatus: 'CHECKED_IN', lastScanAt: at(50) }, now)?.type).toBe('PROLONGED_DWELL');
    expect(evaluateDwell({ status: 'CHECKED_IN', lastMainStatus: 'CHECKED_IN', lastScanAt: at(130) }, now)?.type).toBe('MISSING_SCAN_TIMEOUT');
    expect(evaluateDwell({ status: 'COLLECTED', lastMainStatus: 'COLLECTED', lastScanAt: at(9999) }, now)).toBeNull();
  });
  it('detects repeated scan failures', () => {
    const f = (min) => ({ at: new Date(now.getTime() - min * 60000), checkpointCode: 'X', actorId: 'u' });
    expect(evaluateScanFailures([f(1), f(2)], now)).toBeNull();
    expect(evaluateScanFailures([f(1), f(2), f(3)], now)?.type).toBe('REPEATED_SCAN_FAILURES');
    expect(evaluateScanFailures([f(1), f(2), f(30)], now)).toBeNull();
  });
});

describe('delay prediction', () => {
  const now = new Date('2026-01-01T10:00:00Z');
  it('baseline is low for an on-time bag and high for a stuck bag near departure', () => {
    const ok = baselineRisk(
      buildFeatures({
        lastMainStatus: 'CHECKED_IN',
        lastScanAt: new Date(now.getTime() - 5 * 60000),
        skippedCheckpoints: 0,
        openAnomalies: 0,
        flightStatus: 'SCHEDULED',
        scheduledDeparture: new Date(now.getTime() + 180 * 60000),
        now,
      }),
    );
    const bad = baselineRisk(
      buildFeatures({
        lastMainStatus: 'CHECKED_IN',
        lastScanAt: new Date(now.getTime() - 100 * 60000),
        skippedCheckpoints: 1,
        openAnomalies: 2,
        flightStatus: 'DELAYED',
        scheduledDeparture: new Date(now.getTime() + 20 * 60000),
        now,
      }),
    );
    expect(ok.level).toBe('low');
    expect(bad.level).toBe('high');
    expect(bad.factors.length).toBeGreaterThan(2);
    expect(bad.method).toBe('rules-baseline');
  });
  it('validates and applies a logistic model', () => {
    const model = { version: 't', trainedAt: 'x', dataOrigin: 'synthetic', features: ['dwellRatio'], mean: [0], scale: [1], coef: [2], intercept: -1, metrics: {} };
    expect(isLogisticModel(model)).toBe(true);
    expect(isLogisticModel({ ...model, features: ['nope'] })).toBe(false);
    const f = buildFeatures({
      lastMainStatus: 'LOADED',
      lastScanAt: new Date(now.getTime() - 180 * 60000),
      skippedCheckpoints: 0,
      openAnomalies: 0,
      flightStatus: null,
      scheduledDeparture: null,
      now,
    });
    const r = logisticRisk(f, model);
    expect(r.risk).toBeGreaterThan(0.9);
    expect(r.disclaimer).toMatch(/synthetic/i);
  });
});

describe('digital twin simulation', () => {
  it('normal scenario completes with no alerts', () => {
    const s = advanceSim(initialSimState('normal'), SIM_DURATION_MIN);
    expect(s.status).toBe('COLLECTED');
    expect(s.alerts).toHaveLength(0);
  });
  it('missing-checkpoint scenario raises a missing checkpoint alert', () => {
    const s = advanceSim(initialSimState('missing-checkpoint'), SIM_DURATION_MIN);
    expect(s.alerts.map((a) => a.type)).toContain('MISSING_CHECKPOINT');
  });
  it('anomaly scenario raises duplicate and flight-mismatch alerts', () => {
    const s = advanceSim(initialSimState('anomaly'), SIM_DURATION_MIN);
    const types = s.alerts.map((a) => a.type);
    expect(types).toContain('DUPLICATE_SCAN');
    expect(types).toContain('FLIGHT_MISMATCH');
  });
  it('delayed scenario passes through DELAYED and raises risk', () => {
    const waiting = advanceSim(initialSimState('delayed'), 165);
    expect(waiting.risk.risk).toBeGreaterThan(initialSimState('delayed').risk.risk);
    expect(advanceSim(waiting, 175).status).toBe('DELAYED');
  });
  it('advancing is incremental and idempotent', () => {
    const a = advanceSim(advanceSim(initialSimState('normal'), 100), 300);
    const b = advanceSim(initialSimState('normal'), 300);
    expect(a.events).toEqual(b.events);
  });
});
