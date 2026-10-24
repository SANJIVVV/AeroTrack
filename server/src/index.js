import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { bootstrap } from './bootstrap.js';
import { createApp } from './app.js';
import { EnvError } from './config/env.js';
import { runAnomalySweep } from './services/sweep.js';
import { ensureDirectory } from './services/flights.js';
import { logger } from './utils/logger.js';

const here = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const ctx = await bootstrap();
  const seeded = await ensureDirectory(ctx.now());
  logger.info(seeded, 'Airline directory ready');
  const app = ctx.env.SERVE_CLIENT ? createApp(ctx, { clientDir: path.resolve(here, '../../client'), sharedDir: path.resolve(here, '../../shared/src') }) : createApp(ctx);
  const server = app.listen(ctx.env.PORT, () => {
    logger.info({ port: ctx.env.PORT, env: ctx.env.NODE_ENV, emailMode: ctx.email.mode, flights: 'sample directory (no external API)' }, `AeroTrack Pro listening on http://localhost:${ctx.env.PORT}`);
  });

  let timer;
  if (ctx.env.ANOMALY_SWEEP_INTERVAL_MIN > 0) {
    timer = setInterval(() => {
      runAnomalySweep(ctx).catch((err) => logger.error({ err: err.message }, 'Anomaly sweep failed'));
    }, ctx.env.ANOMALY_SWEEP_INTERVAL_MIN * 60000);
  }

  const shutdown = async (signal) => {
    logger.info({ signal }, 'Shutting down');
    if (timer) clearInterval(timer);
    server.close();
    await mongoose.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  if (err instanceof EnvError) console.error(err.message);
  else logger.fatal({ err: err.message }, 'Failed to start');
  process.exit(1);
});
