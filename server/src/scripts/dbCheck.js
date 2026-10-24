import mongoose from 'mongoose';
import { randomBytes } from 'node:crypto';
import { loadEnv, redactMongoUri } from '../config/env.js';
import { connectDatabase } from '../config/db.js';

/**
 * Verifies the configured MongoDB (e.g. Atlas) with a real round trip:
 * connect, ping, write a marker document, read it back, delete it.
 * Prints only the redacted host, never the URI or password.
 * Usage: npm run db:check
 */
const env = loadEnv();
const host = redactMongoUri(env.MONGODB_URI);
try {
  await connectDatabase(env.MONGODB_URI, env.MONGODB_DB_NAME);
  const db = mongoose.connection.db;
  await db.admin().command({ ping: 1 });
  const marker = randomBytes(8).toString('hex');
  const col = db.collection('_connection_checks');
  await col.insertOne({ marker, at: new Date() });
  const found = await col.findOne({ marker });
  await col.deleteOne({ marker });
  if (!found) throw new Error('wrote a marker document but could not read it back');
  console.log(`OK: connected to ${host}, database "${env.MONGODB_DB_NAME}". Ping, write, read and delete all succeeded.`);
  await mongoose.disconnect();
} catch (err) {
  console.error(`FAILED for ${host}: ${err.message}`);
  console.error('Check the password in .env (URL-encoded), Atlas Network Access (your IP) and the database user role.');
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
}
