import { AnomalyAlert } from '../models/index.js';

/**
 * Store a finding as an alert. With a dedupe key, an identical OPEN alert is
 * not duplicated (the unique sparse index enforces it; the key is cleared when
 * an alert is resolved so the same condition can be raised again later).
 */
export async function raiseAlert(finding, bag, now, dedupeKey) {
  try {
    return await AnomalyAlert.create({
      baggage: bag?._id ?? null,
      reference: bag?.reference ?? null,
      type: finding.type,
      severity: finding.severity,
      reason: finding.reason,
      evidence: finding.evidence,
      recommendedAction: finding.recommendedAction,
      detectedAt: now,
      dedupeKey,
      isDemo: !!bag?.isDemo,
    });
  } catch (err) {
    if (err.code === 11000) return null;
    throw err;
  }
}
