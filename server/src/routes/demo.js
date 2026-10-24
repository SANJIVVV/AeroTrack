import { Router } from 'express';

import { requireRole } from '../middleware/auth.js';
import { resetDemo, seedDemo } from '../services/demo.js';
import { audit } from '../services/audit.js';

export function demoRoutes(ctx) {
  const r = Router();
  r.use(requireRole('admin'));

  r.post('/seed', async (req, res) => {
    const result = await seedDemo(ctx);
    await audit(req.user, 'demo.seeded', undefined, result);
    res.status(201).json({ ...result, notice: 'Demo records are flagged isDemo and labelled DEMO everywhere.' });
  });

  r.post('/reset', async (req, res) => {
    const result = await resetDemo();
    await audit(req.user, 'demo.reset', undefined, result);
    res.json({ deleted: result, notice: 'Only records flagged isDemo were removed.' });
  });

  return r;
}
