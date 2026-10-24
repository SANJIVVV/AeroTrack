import mongoose from 'mongoose';
import { redactMongoUri } from './env.js';
import { logger } from '../utils/logger.js';

mongoose.set('strictQuery', true);
// Query-operator injection (e.g. { $gt: '' }) is prevented at the edge: every
// request body/query is parsed with zod schemas that only admit plain strings,
// numbers and enums before it reaches a query.

export async function connectDatabase(uri, dbName) {
  const safe = redactMongoUri(uri);
  try {
    await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 10_000, autoIndex: true });
    logger.info({ host: safe, dbName }, 'MongoDB connected');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Driver messages do not contain the password, but strip the URI anyway.
    throw new Error(`Could not connect to MongoDB at ${safe}: ${message.replaceAll(uri, safe)}`);
  }
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
}

export function databaseState() {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  return states[mongoose.connection.readyState] ?? 'unknown';
}

export async function pingDatabase() {
  try {
    if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) return false;
    await mongoose.connection.db.admin().command({ ping: 1 });
    return true;
  } catch {
    return false;
  }
}
