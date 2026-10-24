import mongoose from 'mongoose';
import { bootstrap } from '../bootstrap.js';
import { Checkpoint } from '../models/index.js';

/**
 * Creates a starter set of checkpoint definitions (configuration, not data).
 * Usage: npm run seed:checkpoints -w server -- MAA DEL
 * Existing codes are left unchanged.
 */
const airports = process.argv
  .slice(2)
  .filter((a) => /^[A-Z]{3}$/i.test(a))
  .map((a) => a.toUpperCase());
if (airports.length === 0) {
  console.error('Pass one or more IATA airport codes, e.g. MAA DEL');
  process.exit(1);
}
await bootstrap();
const kinds = [
  ['CHECKIN_COUNTER', 'CHK-01', 'Check-in counter 1'],
  ['SECURITY', 'SEC-01', 'Hold baggage screening'],
  ['LOADING', 'LOAD-01', 'Baggage make-up / loading'],
  ['DEPARTURE', 'DEP-01', 'Aircraft departure scan'],
  ['ARRIVAL', 'ARR-01', 'Arrival ramp'],
  ['BELT', 'BELT-01', 'Reclaim belt 1'],
  ['COLLECTION', 'EXIT-01', 'Collection / exit'],
];
let created = 0;
for (const airport of airports) {
  for (const [type, suffix, name] of kinds) {
    const code = `${airport}-${suffix}`;
    const res = await Checkpoint.updateOne({ code }, { $setOnInsert: { code, name: `${airport} ${name}`, airport, type, isDemo: false } }, { upsert: true });
    created += res.upsertedCount;
  }
}
console.log(`Checkpoints created: ${created}`);
await mongoose.disconnect();
