import { Router } from 'express';

import { databaseState, pingDatabase } from '../config/db.js';

export function healthRoutes(ctx) {
  const r = Router();
  // Liveness: the process is up.
  r.get('/live', (_req, res) => {
    res.json({ status: 'ok' });
  });
  // Readiness: database reachable. Reports configuration modes, never values.
  r.get('/', async (_req, res) => {
    const dbOk = await pingDatabase();
    res.status(dbOk ? 200 : 503).json({
      status: dbOk ? 'ok' : 'degraded',
      database: { state: databaseState(), ping: dbOk },
      email: { mode: ctx.email.mode },
      flights: { source: 'sample-directory', live: false },
      delayModel: ctx.delayModel ? { method: 'logistic-regression', version: ctx.delayModel.version, dataOrigin: ctx.delayModel.dataOrigin } : { method: 'rules-baseline' },
      time: ctx.now().toISOString(),
    });
  });
  return r;
}
