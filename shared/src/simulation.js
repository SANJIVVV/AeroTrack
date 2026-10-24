/**
 * Digital-twin simulation engine (presentation mode).
 *
 * Produces synthetic baggage journeys. Everything generated here is
 * SIMULATED: it never touches operational records and is labelled as such in
 * the UI. The engine is deterministic so scenarios replay identically.
 */
import { evaluateScan } from './anomaly.js';
import { baselineRisk, buildFeatures } from './prediction.js';
import { CHECKPOINT_TYPES, isMainFlow } from './status.js';

export const SIM_STAGES = [
  { type: 'CHECKIN_COUNTER', label: 'Check-in', code: 'SIM-MAA-CHK', airport: 'MAA' },
  { type: 'SECURITY', label: 'Security', code: 'SIM-MAA-SEC', airport: 'MAA' },
  { type: 'LOADING', label: 'Loading', code: 'SIM-MAA-LOAD', airport: 'MAA' },
  { type: 'DEPARTURE', label: 'In Transit', code: 'SIM-MAA-DEP', airport: 'MAA' },
  { type: 'ARRIVAL', label: 'Arrival', code: 'SIM-DEL-ARR', airport: 'DEL' },
  { type: 'BELT', label: 'Baggage Belt', code: 'SIM-DEL-BELT', airport: 'DEL' },
  { type: 'COLLECTION', label: 'Collected', code: 'SIM-DEL-EXIT', airport: 'DEL' },
];

export const SCENARIOS = {
  normal: { title: 'Normal journey', description: 'A bag passes every checkpoint on time.' },
  delayed: { title: 'Delayed baggage', description: 'The bag waits too long at loading while the flight is delayed; risk rises and the bag is marked Delayed.' },
  'missing-checkpoint': { title: 'Missing checkpoint', description: 'The security scan is never recorded; the loading scan raises a missing-checkpoint alert.' },
  anomaly: { title: 'Anomaly investigation', description: 'A duplicate scan and a scan at the wrong airport raise alerts for staff to investigate.' },
};

function plan(s) {
  switch (s) {
    case 'normal':
      return [0, 1, 2, 3, 4, 5, 6].map((stage, i) => ({ atMin: [10, 25, 50, 70, 230, 245, 260][i], stage }));
    case 'delayed':
      return [
        { atMin: 10, stage: 0 },
        { atMin: 25, stage: 1 },
        { atMin: 50, stage: 2 },
        { atMin: 170, stage: 2, status: 'DELAYED', note: 'Flight delayed; bag held at loading.' },
        { atMin: 200, stage: 3 },
        { atMin: 360, stage: 4 },
        { atMin: 380, stage: 5 },
        { atMin: 395, stage: 6 },
      ];
    case 'missing-checkpoint':
      return [
        { atMin: 10, stage: 0 },
        { atMin: 55, stage: 2 },
        { atMin: 75, stage: 3 },
        { atMin: 235, stage: 4 },
        { atMin: 250, stage: 5 },
        { atMin: 262, stage: 6 },
      ];
    case 'anomaly':
      return [
        { atMin: 10, stage: 0 },
        { atMin: 11, stage: 0, note: 'Scanner read the tag twice.' },
        { atMin: 26, stage: 1 },
        { atMin: 52, stage: 2 },
        { atMin: 72, stage: 3 },
        { atMin: 232, stage: 4, airportOverride: 'BOM', note: 'Scanned at an unexpected airport.' },
        { atMin: 250, stage: 5 },
        { atMin: 265, stage: 6 },
      ];
  }
}

export const SIM_DURATION_MIN = 420;

export function initialSimState(scenario) {
  const flight = {
    number: 'SIM 101',
    origin: 'MAA',
    destination: 'DEL',
    departureMin: 90,
    status: scenario === 'delayed' ? 'DELAYED' : 'SCHEDULED',
  };
  const state = {
    scenario,
    bagReference: 'SIM-DEMO-0001',
    flight,
    minute: 0,
    status: 'REGISTERED',
    lastMainStatus: 'REGISTERED',
    activeStage: -1,
    events: [],
    alerts: [],
    risk: baselineRisk(
      buildFeatures({
        lastMainStatus: 'REGISTERED',
        lastScanAt: null,
        skippedCheckpoints: 0,
        openAnomalies: 0,
        flightStatus: flight.status,
        scheduledDeparture: new Date(90 * 60000),
        now: new Date(0),
      }),
    ),
    done: false,
  };
  return state;
}

/** Advance the simulation to `minute`, applying every planned scan up to it. */
export function advanceSim(prev, minute) {
  const target = Math.min(SIM_DURATION_MIN, Math.max(prev.minute, minute));
  const state = { ...prev, events: [...prev.events], alerts: [...prev.alerts], minute: target };
  const scans = plan(state.scenario).filter((p) => p.atMin > prev.minute && p.atMin <= target);
  let skipped = state.alerts.filter((a) => a.type === 'MISSING_CHECKPOINT').length;

  for (const p of scans) {
    const stage = SIM_STAGES[p.stage];
    const recent = state.events
      .filter((e) => e.accepted)
      .map((e) => ({ status: e.status, checkpointCode: e.checkpoint, occurredAt: new Date(e.atMin * 60000) }))
      .reverse();
    const evaluation = evaluateScan({
      bag: { status: state.status, lastMainStatus: state.lastMainStatus },
      checkpoint: { code: stage.code, type: stage.type, airport: p.airportOverride ?? stage.airport },
      requestedStatus: p.status ?? CHECKPOINT_TYPES[stage.type],
      flight: { origin: state.flight.origin, destination: state.flight.destination },
      recentEvents: recent,
      now: new Date(p.atMin * 60000),
    });
    const accepted = evaluation.action === 'record';
    state.events.push({ atMin: p.atMin, status: evaluation.status, checkpoint: stage.code, label: stage.label, findings: evaluation.findings, accepted, note: p.note });
    state.alerts.push(...evaluation.findings);
    skipped += evaluation.findings.filter((f) => f.type === 'MISSING_CHECKPOINT').length;
    if (accepted) {
      state.status = evaluation.status;
      if (isMainFlow(evaluation.status)) {
        state.lastMainStatus = evaluation.status;
        state.activeStage = p.stage;
      }
    }
  }

  const lastAccepted = [...state.events].reverse().find((e) => e.accepted);
  state.risk = baselineRisk(
    buildFeatures({
      lastMainStatus: state.lastMainStatus,
      lastScanAt: lastAccepted ? new Date(lastAccepted.atMin * 60000) : null,
      skippedCheckpoints: skipped,
      openAnomalies: state.alerts.length,
      flightStatus: state.flight.status,
      scheduledDeparture: new Date(state.flight.departureMin * 60000),
      now: new Date(target * 60000),
    }),
  );
  state.done = state.status === 'COLLECTED' || target >= SIM_DURATION_MIN;
  return state;
}
