import { Router } from 'express';
import { z } from 'zod';
import { CHECKPOINT_TYPE_LIST } from '@aerotrack/shared';

import { Checkpoint } from '../models/index.js';
import { requireRole } from '../middleware/auth.js';
import { demoScope, objectId, parse } from '../validators/common.js';
import { audit } from '../services/audit.js';
import { notFound } from '../utils/errors.js';

export function checkpointRoutes(_ctx) {
  const r = Router();
  r.use(requireRole('staff', 'admin'));

  r.get('/', async (req, res) => {
    const q = parse(z.object({ scope: demoScope.default('all') }), req.query);
    const filter = q.scope === 'all' ? {} : { isDemo: q.scope === 'demo' };
    const items = await Checkpoint.find(filter).sort({ airport: 1, code: 1 }).lean();
    res.json({ items: items.map((c) => ({ id: String(c._id), code: c.code, name: c.name, airport: c.airport, type: c.type, readerKind: c.readerKind, active: c.active, isDemo: c.isDemo })) });
  });

  const body = z.object({
    code: z
      .string()
      .trim()
      .regex(/^[A-Z0-9-]{3,32}$/i, 'Use 3-32 letters, digits or dashes'),
    name: z.string().trim().min(2).max(100),
    airport: z
      .string()
      .trim()
      .regex(/^[A-Z]{3,4}$/i, 'Use a 3-letter IATA or 4-letter ICAO code'),
    type: z.enum(CHECKPOINT_TYPE_LIST),
    active: z.boolean().default(true),
  });

  r.post('/', requireRole('admin'), async (req, res) => {
    const data = parse(body, req.body);
    if (data.code.toUpperCase().startsWith('DEMO-')) throw notFound('Route'); // DEMO- prefix is reserved
    const cp = await Checkpoint.create({ ...data, readerKind: 'qr', isDemo: false });
    await audit(req.user, 'checkpoint.created', { type: 'checkpoint', id: cp.code });
    res.status(201).json({ checkpoint: cp });
  });

  r.patch('/:id', requireRole('admin'), async (req, res) => {
    const id = parse(objectId, req.params.id);
    const data = parse(body.partial().omit({ code: true }), req.body);
    const cp = await Checkpoint.findOneAndUpdate({ _id: id, isDemo: false }, data, { new: true });
    if (!cp) throw notFound('Checkpoint');
    await audit(req.user, 'checkpoint.updated', { type: 'checkpoint', id: cp.code }, data);
    res.json({ checkpoint: cp });
  });

  return r;
}
