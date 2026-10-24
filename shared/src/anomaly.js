/**
 * Transparent, rules-based anomaly detection.
 *
 * Every finding carries the reason, the evidence it was based on, a severity
 * and a recommended action. Findings describe operational irregularities only;
 * they never assert theft, fraud or intent.
 */

import { CHECKPOINT_TYPES, DWELL_THRESHOLDS_MIN, STATUS_LABELS, checkTransition, checkpointSide, isMainFlow } from './status.js';

export const RULE_CONFIG = {
  duplicateWindowSec: 120,
  conflictWindowSec: 300,
  scanFailureWindowMin: 10,
  scanFailureThreshold: 3,
};

export function evaluateScan(input) {
  const { bag, checkpoint, flight, recentEvents, now } = input;
  const status = input.requestedStatus ?? CHECKPOINT_TYPES[checkpoint.type];
  const findings = [];

  // 1. Duplicate: same checkpoint + same status within the window.
  const dup = recentEvents.find((e) => e.checkpointCode === checkpoint.code && e.status === status && (now.getTime() - e.occurredAt.getTime()) / 1000 <= RULE_CONFIG.duplicateWindowSec);
  if (dup) {
    findings.push({
      type: 'DUPLICATE_SCAN',
      severity: 'low',
      reason: `Bag scanned again at ${checkpoint.code} for the same status within ${RULE_CONFIG.duplicateWindowSec}s.`,
      evidence: { checkpoint: checkpoint.code, status, previousScanAt: dup.occurredAt.toISOString() },
      recommendedAction: 'No status change was recorded. Check whether the scanner is double-reading.',
    });
    return { action: 'duplicate', findings, status };
  }

  // 2. Transition rules.
  const verdict = checkTransition(bag.status, status, bag.lastMainStatus);
  if (!verdict.ok) {
    if (verdict.reason === 'SAME_STATUS') {
      return { action: 'duplicate', findings, status };
    }
    findings.push({
      type: 'INVALID_SEQUENCE',
      severity: 'medium',
      reason: `Scan tried to move bag from ${STATUS_LABELS[bag.status]} to ${STATUS_LABELS[status]} (${verdict.reason.toLowerCase().replace('_', ' ')}).`,
      evidence: { currentStatus: bag.status, attemptedStatus: status, checkpoint: checkpoint.code },
      recommendedAction: 'Verify the bag physically and confirm which checkpoint it is actually at.',
    });
    return { action: 'reject', findings, status, reason: verdict.reason };
  }
  if (verdict.skipped.length > 0) {
    findings.push({
      type: 'MISSING_CHECKPOINT',
      severity: verdict.skipped.includes('SECURITY_SCREENING') ? 'high' : 'medium',
      reason: `No scan recorded for: ${verdict.skipped.map((s) => STATUS_LABELS[s]).join(', ')}.`,
      evidence: { skipped: verdict.skipped, from: bag.lastMainStatus, to: status },
      recommendedAction: verdict.skipped.includes('SECURITY_SCREENING')
        ? 'Confirm with the screening area that the bag was screened before it proceeds.'
        : 'Check the skipped checkpoint scanner and confirm the bag passed through it.',
    });
  }

  // 3. Flight association: checkpoint airport must match origin/destination.
  if (flight && isMainFlow(status)) {
    const side = checkpointSide(checkpoint.type);
    const expected = side === 'ORIGIN' ? flight.origin : flight.destination;
    if (expected && checkpoint.airport.toUpperCase() !== expected.toUpperCase()) {
      findings.push({
        type: 'FLIGHT_MISMATCH',
        severity: 'high',
        reason: `Checkpoint airport ${checkpoint.airport} does not match the flight's ${side.toLowerCase()} ${expected}.`,
        evidence: { checkpointAirport: checkpoint.airport, expectedAirport: expected, side },
        recommendedAction: 'Check the bag tag and flight association; the bag may be misrouted.',
      });
    }
  }

  // 4. Conflicting status: a different checkpoint recorded a different status very recently.
  const conflict = recentEvents.find(
    (e) => e.checkpointCode !== null && e.checkpointCode !== checkpoint.code && e.status !== status && isMainFlow(e.status) && (now.getTime() - e.occurredAt.getTime()) / 1000 <= 60,
  );
  if (conflict) {
    findings.push({
      type: 'CONFLICTING_STATUS',
      severity: 'medium',
      reason: `Two checkpoints reported different statuses within 60 seconds.`,
      evidence: {
        previous: { checkpoint: conflict.checkpointCode, status: conflict.status, at: conflict.occurredAt.toISOString() },
        current: { checkpoint: checkpoint.code, status },
      },
      recommendedAction: 'Confirm the physical location of the bag; one of the scans may be erroneous.',
    });
  }

  return { action: 'record', findings, status };
}

/** Dwell-time check, run periodically for bags that have not been scanned recently. */
export function evaluateDwell(bag, now) {
  if (!bag.lastScanAt || bag.status === 'COLLECTED' || bag.status === 'MISSING') return null;
  const thresholds = DWELL_THRESHOLDS_MIN[bag.lastMainStatus];
  if (!thresholds) return null;
  const minutes = Math.floor((now.getTime() - bag.lastScanAt.getTime()) / 60000);
  const evidence = { lastMainStatus: bag.lastMainStatus, lastScanAt: bag.lastScanAt.toISOString(), minutesSinceLastScan: minutes, thresholds };
  if (minutes >= thresholds.critical) {
    return {
      type: 'MISSING_SCAN_TIMEOUT',
      severity: 'high',
      reason: `No scan for ${minutes} min after ${STATUS_LABELS[bag.lastMainStatus]} (limit ${thresholds.critical} min).`,
      evidence,
      recommendedAction: 'Locate the bag at its last checkpoint and consider marking it Delayed or Missing.',
    };
  }
  if (minutes >= thresholds.warn) {
    return {
      type: 'PROLONGED_DWELL',
      severity: 'medium',
      reason: `Bag has stayed at ${STATUS_LABELS[bag.lastMainStatus]} for ${minutes} min (expected under ${thresholds.warn} min).`,
      evidence,
      recommendedAction: 'Check the queue at the current checkpoint.',
    };
  }
  return null;
}

/** Repeated failed scans at one checkpoint or by one operator. */
export function evaluateScanFailures(failures, now) {
  const windowStart = now.getTime() - RULE_CONFIG.scanFailureWindowMin * 60000;
  const recent = failures.filter((f) => f.at.getTime() >= windowStart);
  if (recent.length < RULE_CONFIG.scanFailureThreshold) return null;
  return {
    type: 'REPEATED_SCAN_FAILURES',
    severity: 'medium',
    reason: `${recent.length} failed scans in the last ${RULE_CONFIG.scanFailureWindowMin} minutes.`,
    evidence: { count: recent.length, checkpoint: recent[0]?.checkpointCode ?? null },
    recommendedAction: 'Inspect the scanner, lighting and tag print quality; use manual entry meanwhile.',
  };
}
