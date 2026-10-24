import { readFile } from 'node:fs/promises';
import { baselineRisk, buildFeatures, isLogisticModel, logisticRisk } from '@aerotrack/shared';

import { AnomalyAlert, PredictionRecord } from '../models/index.js';
import { logger } from '../utils/logger.js';

export async function loadDelayModel(path) {
  if (!path) return null;
  try {
    const json = JSON.parse(await readFile(path, 'utf8'));
    if (!isLogisticModel(json)) {
      logger.warn('Delay model file is not a valid logistic model; using rules baseline');
      return null;
    }
    logger.info({ version: json.version, dataOrigin: json.dataOrigin }, 'Delay model loaded');
    return json;
  } catch {
    logger.warn('Delay model file could not be read; using rules baseline');
    return null;
  }
}

export async function estimateDelay(ctx, bag) {
  const now = ctx.now();
  const openAnomalies = await AnomalyAlert.countDocuments({ baggage: bag._id, status: { $in: ['OPEN', 'ACKNOWLEDGED', 'INVESTIGATING', 'ESCALATED'] } });
  const flight = bag.flight && bag.flight.flightNumber ? bag.flight : null;
  const features = buildFeatures({
    lastMainStatus: bag.lastMainStatus,
    lastScanAt: bag.lastScanAt ?? null,
    skippedCheckpoints: bag.skippedCheckpoints ?? 0,
    openAnomalies,
    flightStatus: flight?.status ?? null,
    scheduledDeparture: flight?.scheduledDeparture ?? null,
    now,
  });
  const estimate = ctx.delayModel ? logisticRisk(features, ctx.delayModel) : baselineRisk(features);
  return { ...estimate, computedAt: now.toISOString(), features: { ...features } };
}

export async function recordPrediction(ctx, bag) {
  const est = await estimateDelay(ctx, bag);
  await PredictionRecord.create({
    baggage: bag._id,
    method: est.method,
    risk: est.risk,
    level: est.level,
    features: est.features,
    factors: est.factors,
    modelVersion: est.modelInfo?.version ?? null,
    computedAt: new Date(est.computedAt),
    isDemo: !!bag.isDemo,
  });
  return est;
}
