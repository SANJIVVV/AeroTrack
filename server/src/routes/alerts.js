import { Router } from 'express';
import { z } from 'zod';
import { ALERT_STATUSES, ANOMALY_TYPES, SEVERITIES } from '@aerotrack/shared';

import { AnomalyAlert } from '../models/index.js';
import { requireRole } from '../middleware/auth.js';
import { demoScope, objectId, pagination, parse } from '../validators/common.js';
import { notFound } from '../utils/errors.js';
import { audit } from '../services/audit.js';
import { runAnomalySweep } from '../services/sweep.js';

const toAlertDTO = (a) => ({
  id: String(a._id),
  reference: a.reference,
  type: a.type,
  severity: a.severity,
  reason: a.reason,
  evidence: a.evidence,
  recommendedAction: a.recommendedAction,
  status: a.status,
  detectedAt: a.detectedAt,
  history: (a.history ?? []).map((h) => ({ byName: h.byName, text: h.text, status: h.status, at: h.at })),
  isDemo: !!a.isDemo,
});

export function alertRoutes(ctx) {
  const r = Router();
  r.use(requireRole('staff', 'admin'));

  r.get('/', async (req, res) => {
    const q = parse(
      pagination.extend({
        status: z.enum([...ALERT_STATUSES, 'ACTIVE']).optional(),
        severity: z.enum(SEVERITIES).optional(),
        type: z.enum(ANOMALY_TYPES).optional(),
        reference: z.string().max(20).optional(),
        scope: demoScope,
      }),
      req.query,
    );
    const filter = {};
    if (q.scope !== 'all') filter.isDemo = q.scope === 'demo';
    if (q.status === 'ACTIVE') filter.status = { $ne: 'RESOLVED' };
    else if (q.status) filter.status = q.status;
    if (q.severity) filter.severity = q.severity;
    if (q.type) filter.type = q.type;
    if (q.reference) filter.reference = q.reference.toUpperCase();
    const [items, total] = await Promise.all([
      AnomalyAlert.find(filter)
        .sort({ detectedAt: -1 })
        .skip((q.page - 1) * q.pageSize)
        .limit(q.pageSize)
        .lean(),
      AnomalyAlert.countDocuments(filter),
    ]);
    res.json({ items: items.map(toAlertDTO), page: q.page, pageSize: q.pageSize, total });
  });

  // Acknowledge / investigate / escalate / resolve, with an optional note.
  r.patch('/:id', async (req, res) => {
    const id = parse(objectId, req.params.id);
    const body = parse(z.object({ status: z.enum(ALERT_STATUSES), note: z.string().trim().max(1000).optional() }), req.body);
    const alert = await AnomalyAlert.findById(id);
    if (!alert) throw notFound('Alert');
    alert.status = body.status;
    alert.history.push({ by: req.user._id, byName: req.user.name, text: body.note ?? '', status: body.status, at: ctx.now() });
    // Free the dedupe key so the same condition can be raised again later.
    if (body.status === 'RESOLVED') alert.dedupeKey = undefined;
    await alert.save();
    await audit(req.user, 'alert.updated', { type: 'alert', id: String(alert._id) }, { status: body.status }, alert.isDemo);
    res.json({ alert: toAlertDTO(alert) });
  });

  r.post('/sweep', requireRole('admin'), async (req, res) => {
    const result = await runAnomalySweep(ctx);
    await audit(req.user, 'alert.sweep', undefined, result);
    res.json(result);
  });

  return r;
}
