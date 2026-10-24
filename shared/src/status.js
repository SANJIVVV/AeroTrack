/**
 * Baggage status model and transition rules.
 *
 * The "main flow" is the normal journey of a bag. Exception statuses
 * (DELAYED, MISSING, INCIDENT_REPORTED) can be entered from any non-terminal
 * point and left again by resuming the main flow at or after the last
 * verified main-flow status.
 */

export const MAIN_FLOW = ['REGISTERED', 'CHECKED_IN', 'SECURITY_SCREENING', 'LOADED', 'IN_TRANSIT', 'ARRIVED', 'ON_BELT', 'COLLECTED'];

export const EXCEPTION_STATUSES = ['DELAYED', 'MISSING', 'INCIDENT_REPORTED'];

export const BAGGAGE_STATUSES = [...MAIN_FLOW, ...EXCEPTION_STATUSES];

export const STATUS_LABELS = {
  REGISTERED: 'Registered',
  CHECKED_IN: 'Checked In',
  SECURITY_SCREENING: 'Security Screening',
  LOADED: 'Loaded',
  IN_TRANSIT: 'In Transit',
  ARRIVED: 'Arrived',
  ON_BELT: 'On Baggage Belt',
  COLLECTED: 'Collected',
  DELAYED: 'Delayed',
  MISSING: 'Missing',
  INCIDENT_REPORTED: 'Incident Reported',
};

export function isMainFlow(s) {
  return MAIN_FLOW.includes(s);
}

export function isException(s) {
  return EXCEPTION_STATUSES.includes(s);
}

export function mainFlowIndex(s) {
  return MAIN_FLOW.indexOf(s);
}

/**
 * Decide whether a bag may move from `current` to `next`.
 *
 * @param lastMain the last main-flow status the bag reached (needed when the
 *   bag is currently in an exception status).
 *
 * Forward skips in the main flow are allowed but reported in `skipped`, so
 * the caller can raise a "missing checkpoint" anomaly. Backward moves are
 * rejected.
 */
export function checkTransition(current, next, lastMain) {
  if (current === next) return { ok: false, reason: 'SAME_STATUS' };
  if (current === 'COLLECTED') {
    // A collected bag can still get an incident (e.g. damage found later).
    return next === 'INCIDENT_REPORTED' ? { ok: true, skipped: [] } : { ok: false, reason: 'TERMINAL' };
  }
  if (isException(next)) return { ok: true, skipped: [] };

  const from = isException(current) ? lastMain : current;
  const fromIdx = mainFlowIndex(from);
  const toIdx = mainFlowIndex(next);
  if (toIdx < fromIdx) return { ok: false, reason: 'BACKWARD' };
  if (toIdx === fromIdx) {
    // Resuming from an exception back to the same main status is allowed.
    return isException(current) ? { ok: true, skipped: [] } : { ok: false, reason: 'SAME_STATUS' };
  }
  return { ok: true, skipped: MAIN_FLOW.slice(fromIdx + 1, toIdx) };
}

/** Statuses a staff member can sensibly choose next. */
export function allowedNextStatuses(current, lastMain) {
  return BAGGAGE_STATUSES.filter((s) => checkTransition(current, s, lastMain).ok);
}

/** Expected next main-flow step, or null when the journey is complete. */
export function nextMainStep(lastMain) {
  const i = mainFlowIndex(lastMain);
  return i >= 0 && i < MAIN_FLOW.length - 1 ? MAIN_FLOW[i + 1] : null;
}

/** Checkpoint types and the main-flow status a scan at that checkpoint records. */
export const CHECKPOINT_TYPES = {
  CHECKIN_COUNTER: 'CHECKED_IN',
  SECURITY: 'SECURITY_SCREENING',
  LOADING: 'LOADED',
  DEPARTURE: 'IN_TRANSIT',
  ARRIVAL: 'ARRIVED',
  BELT: 'ON_BELT',
  COLLECTION: 'COLLECTED',
};

export const CHECKPOINT_TYPE_LIST = Object.keys(CHECKPOINT_TYPES);

/** Whether a checkpoint type sits at the origin or destination airport. */
export function checkpointSide(t) {
  return t === 'ARRIVAL' || t === 'BELT' || t === 'COLLECTION' ? 'DESTINATION' : 'ORIGIN';
}

/**
 * Expected maximum dwell time (minutes) in each main-flow status before a bag
 * is considered "prolonged" (warn) or "missing scan" (critical). These are
 * configurable defaults for the rules engine, not measured airport data.
 */
export const DWELL_THRESHOLDS_MIN = {
  REGISTERED: null, // passenger may register days ahead
  CHECKED_IN: { warn: 45, critical: 120 },
  SECURITY_SCREENING: { warn: 30, critical: 90 },
  LOADED: { warn: 90, critical: 240 },
  IN_TRANSIT: { warn: 720, critical: 1440 },
  ARRIVED: { warn: 30, critical: 90 },
  ON_BELT: { warn: 60, critical: 180 },
  COLLECTED: null,
};
