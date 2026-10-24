import mongoose from 'mongoose';
import { bootstrap } from '../bootstrap.js';
import { seedAirlines, seedDemoFlights } from '../services/flights.js';

/**
 * Upserts the demonstration airline directory and refreshes the sample flight
 * times relative to now. Safe to run repeatedly: records are keyed by airline
 * code and flight number, so nothing is duplicated.
 * Usage: npm run seed
 */
await bootstrap();
const airlines = await seedAirlines();
const flights = await seedDemoFlights(new Date());
console.log(`Airline directory: ${airlines} airlines. Sample flights (demo data): ${flights.length}.`);
await mongoose.disconnect();
