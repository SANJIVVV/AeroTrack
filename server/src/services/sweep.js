import { evaluateDwell } from '@aerotrack/shared';

import { Baggage } from '../models/index.js';
import { raiseAlert } from './alerts.js';
import { recordPrediction } from './prediction.js';
import { notify } from './notifications.js';
import { logger } from '../utils/logger.js';

/**
 * Periodic check for bags that have gone quiet. Raises at most one open
 * alert per bag, stage and rule, and refreshes the stored delay estimate.
 */
export async function runAnomalySweep(ctx) {
  const now = ctx.now();
  const active = await Baggage.find({ status: { $nin: ['COLLECTED', 'REGISTERED'] }, lastScanAt: { $ne: null } })
    .populate('flight')
    .limit(2000);
  let raised = 0;
  for (const bag of active) {
    const finding = evaluateDwell({ status: bag.status, lastMainStatus: bag.lastMainStatus, lastScanAt: bag.lastScanAt ?? null }, now);
    if (finding) {
      const alert = await raiseAlert(finding, bag, now, `dwell:${bag._id}:${bag.lastMainStatus}:${finding.type}`);
      if (alert) raised++;
    }
    const est = await recordPrediction(ctx, bag);
    if (est.level === 'high') {
      await notify(ctx, {
        userId: bag.owner,
        kind: 'DELAY_RISK',
        title: 'Elevated delay risk',
        body: `${bag.reference} has an elevated estimated delay risk (${Math.round(est.risk * 100)}%). This is an estimate, not a confirmed delay.`,
        link: `/baggage/${bag.reference}`,
        dedupeKey: `risk:${bag._id}:${bag.lastMainStatus}`,
        isDemo: !!bag.isDemo,
      });
    }
  }
  logger.info({ checked: active.length, raised }, 'Anomaly sweep complete');
  return { checked: active.length, raised };
}
