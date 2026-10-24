/**
 * Delay-risk estimation.
 *
 * Two estimators share one feature vector:
 *  - `baselineRisk`: a transparent weighted rules baseline (always available).
 *  - `logisticRisk`: a logistic-regression model exported by ml/train.py as
 *    JSON. It is only used when a model file is present, and its metadata
 *    (training data origin, metrics) is shown alongside every prediction.
 *
 * Features only use information available at prediction time (no leakage of
 * the eventual outcome).
 */
import { DWELL_THRESHOLDS_MIN, MAIN_FLOW, mainFlowIndex } from './status.js';

export const FEATURE_NAMES = [
  'stageIndex',
  'minutesSinceLastScan',
  'dwellRatio',
  'skippedCheckpoints',
  'openAnomalies',
  'flightDelayed',
  'flightCancelled',
  'minutesToDeparture',
  'notLoadedNearDeparture',
];

export function buildFeatures(input) {
  const stageIndex = mainFlowIndex(input.lastMainStatus);
  const minutesSinceLastScan = input.lastScanAt ? Math.max(0, (input.now.getTime() - input.lastScanAt.getTime()) / 60000) : 0;
  const warn = DWELL_THRESHOLDS_MIN[input.lastMainStatus]?.warn ?? 0;
  const minutesToDepartureRaw = input.scheduledDeparture ? (input.scheduledDeparture.getTime() - input.now.getTime()) / 60000 : 1440;
  const minutesToDeparture = Math.min(1440, Math.max(-600, minutesToDepartureRaw));
  const loadedIdx = mainFlowIndex('LOADED');
  return {
    stageIndex,
    minutesSinceLastScan: Math.round(minutesSinceLastScan),
    dwellRatio: warn > 0 ? Math.round((minutesSinceLastScan / warn) * 100) / 100 : 0,
    skippedCheckpoints: input.skippedCheckpoints,
    openAnomalies: input.openAnomalies,
    flightDelayed: input.flightStatus === 'DELAYED' ? 1 : 0,
    flightCancelled: input.flightStatus === 'CANCELLED' ? 1 : 0,
    minutesToDeparture: Math.round(minutesToDeparture),
    notLoadedNearDeparture: stageIndex < loadedIdx && stageIndex > 0 && minutesToDeparture < 45 && minutesToDeparture > -600 ? 1 : 0,
  };
}

function level(risk) {
  return risk >= 0.6 ? 'high' : risk >= 0.3 ? 'medium' : 'low';
}

const clamp01 = (n) => Math.min(1, Math.max(0, n));

/** Transparent additive baseline. Weights are hand-set, documented heuristics. */
export function baselineRisk(f) {
  const factors = [];
  const add = (feature, label, contribution) => {
    if (contribution > 0) factors.push({ feature, label, contribution: Math.round(contribution * 100) / 100 });
  };
  const collected = f.stageIndex === MAIN_FLOW.length - 1;
  if (!collected) {
    add('dwellRatio', 'Time at current checkpoint vs expected', Math.min(0.4, Math.max(0, f.dwellRatio - 0.5) * 0.25));
    add('skippedCheckpoints', 'Missing checkpoint scans', Math.min(0.25, f.skippedCheckpoints * 0.12));
    add('openAnomalies', 'Open anomaly alerts', Math.min(0.2, f.openAnomalies * 0.08));
    add('flightDelayed', 'Flight reported delayed', f.flightDelayed * 0.15);
    add('flightCancelled', 'Flight reported cancelled', f.flightCancelled * 0.35);
    add('notLoadedNearDeparture', 'Not loaded with under 45 min to departure', f.notLoadedNearDeparture * 0.3);
  }
  const risk = clamp01(0.05 + factors.reduce((s, x) => s + x.contribution, 0));
  return {
    method: 'rules-baseline',
    risk: Math.round(risk * 100) / 100,
    level: level(risk),
    interval: [clamp01(risk - 0.15), clamp01(risk + 0.15)],
    factors: factors.sort((a, b) => b.contribution - a.contribution),
    disclaimer: 'Rules-based baseline with hand-set weights. It is not trained on airport data and is not calibrated.',
  };
}

export function isLogisticModel(x) {
  if (!x || typeof x !== 'object') return false;
  const m = x;
  return (
    Array.isArray(m.features) &&
    Array.isArray(m.coef) &&
    m.features.length === m.coef.length &&
    m.mean?.length === m.coef.length &&
    m.scale?.length === m.coef.length &&
    typeof m.intercept === 'number' &&
    m.features.every((n) => FEATURE_NAMES.includes(n))
  );
}

export function logisticRisk(f, model) {
  let z = model.intercept;
  const factors = [];
  model.features.forEach((name, i) => {
    const x = (f[name] - (model.mean[i] ?? 0)) / (model.scale[i] || 1);
    const c = x * (model.coef[i] ?? 0);
    z += c;
    if (c > 0.05) factors.push({ feature: name, label: name, contribution: Math.round(c * 100) / 100 });
  });
  const risk = 1 / (1 + Math.exp(-z));
  const width = model.dataOrigin.toLowerCase().includes('synthetic') ? 0.2 : 0.1;
  return {
    method: 'logistic-regression',
    risk: Math.round(risk * 100) / 100,
    level: level(risk),
    interval: [clamp01(risk - width), clamp01(risk + width)],
    factors: factors.sort((a, b) => b.contribution - a.contribution),
    modelInfo: { version: model.version, trainedAt: model.trainedAt, dataOrigin: model.dataOrigin, metrics: model.metrics },
    disclaimer: model.dataOrigin.toLowerCase().includes('synthetic')
      ? 'Model trained on synthetic data only. Metrics describe the synthetic set, not real airport performance.'
      : `Model trained on ${model.dataOrigin}. Factor values are log-odds contributions.`,
  };
}
