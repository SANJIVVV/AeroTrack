import { AIRLINE_DIRECTORY, sampleFlights } from '@aerotrack/shared';
import { Airline, Baggage, Flight } from '../models/index.js';

/** Upsert the airline directory. Safe to run repeatedly (keyed by IATA code). */
export async function seedAirlines() {
  await Airline.bulkWrite(
    AIRLINE_DIRECTORY.map(({ sampleRoutes: _r, featured, ...a }) => ({
      updateOne: { filter: { code: a.code }, update: { $set: { ...a, featuredFlightNumber: `${a.code}${featured.number}`, active: true, isDemoDirectory: true } }, upsert: true },
    })),
  );
  // Seeded entries that left the directory (e.g. a replaced airline) are kept but marked inactive.
  await Airline.updateMany({ isDemoDirectory: true, code: { $nin: AIRLINE_DIRECTORY.map((a) => a.code) } }, { $set: { active: false } });
  return AIRLINE_DIRECTORY.length;
}

/**
 * Upsert the sample (demonstration) flights, keyed by flight number, so ids
 * stay stable and re-running never creates duplicates. Times are regenerated
 * relative to `now`.
 */
export async function seedDemoFlights(now) {
  const docs = [];
  const all = sampleFlights(now);
  for (const f of all) {
    docs.push(await Flight.findOneAndUpdate({ flightNumber: f.flightNumber, isDemo: true }, { $set: { ...f, source: 'demo', lastRefreshedAt: now, isDemo: true } }, { upsert: true, new: true }));
  }
  // Remove sample flights that are no longer in the directory, unless bags are booked on them.
  const stale = await Flight.find({ isDemo: true, source: 'demo', flightNumber: { $nin: all.map((f) => f.flightNumber) } }, { _id: 1 }).lean();
  for (const s of stale) if (!(await Baggage.exists({ flight: s._id }))) await Flight.deleteOne({ _id: s._id });
  return docs;
}

/** On startup, create the directory and sample flights only if they are missing. */
export async function ensureDirectory(now) {
  const airlines = await seedAirlines();
  const expected = sampleFlights(now).map((f) => f.flightNumber);
  const existing = await Flight.countDocuments({ isDemo: true, source: 'demo', flightNumber: { $in: expected } });
  const flights = existing === expected.length ? 0 : (await seedDemoFlights(now)).length;
  return { airlines, flightsCreated: flights };
}
