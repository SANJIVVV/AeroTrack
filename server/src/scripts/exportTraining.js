import { writeFile } from 'node:fs/promises';
import mongoose from 'mongoose';
import { FEATURE_NAMES } from '@aerotrack/shared';
import { bootstrap } from '../bootstrap.js';
import { PredictionRecord } from '../models/index.js';

/**
 * Export labelled prediction snapshots (operational data only) for ml/train.py.
 * Usage: npm run export:training -w server -- ../ml/data/training.csv
 * Rows contain feature values, timestamp and label only: no personal data.
 */
const out = process.argv[2] ?? 'training.csv';
await bootstrap();
const rows = await PredictionRecord.find({ isDemo: false, outcomeDelayed: { $ne: null } })
  .sort({ computedAt: 1 })
  .lean();
const header = ['computed_at', 'baggage_id', ...FEATURE_NAMES, 'delayed'];
const lines = [header.join(',')];
for (const r of rows) {
  const f = r.features;
  lines.push([r.computedAt.toISOString(), String(r.baggage), ...FEATURE_NAMES.map((n) => f[n] ?? 0), r.outcomeDelayed ? 1 : 0].join(','));
}
await writeFile(out, lines.join('\n') + '\n');
console.log(`Exported ${rows.length} labelled rows to ${out}`);
await mongoose.disconnect();
