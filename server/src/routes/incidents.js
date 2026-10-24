import { Router } from 'express';
import { z } from 'zod';
import { INCIDENT_STATUSES, INCIDENT_TYPES } from '@aerotrack/shared';

import { Incident } from '../models/index.js';
import { isStaff, requireAuth, requireRole } from '../middleware/auth.js';
import { demoScope, objectId, pagination, parse } from '../validators/common.js';
import { loadAccessibleBag } from './baggage.js';
import { notFound, conflict } from '../utils/errors.js';
import { notify } from '../services/notifications.js';
import { audit } from '../services/audit.js';
import { changeStatus } from '../services/tracking.js';

function toIncidentDTO(i, showNames) {
  return {
    id: String(i._id),
    type: i.type,
    status: i.status,
    description: i.description,
    reference: i.baggage?.reference ?? null,
    baggageDescription: i.baggage?.description ?? null,
    reporterName: showNames ? (i.reporter?.name ?? null) : undefined,
    history: (i.history ?? []).map((h) => ({ byName: h.byName, text: h.text, status: h.status, at: h.at })),
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
    isDemo: !!i.isDemo,
  };
}

export function incidentRoutes(ctx) {
  const r = Router();
  r.use(requireAuth);

  r.get('/', async (req, res) => {
    const q = parse(pagination.extend({ status: z.enum(INCIDENT_STATUSES).optional(), type: z.enum(INCIDENT_TYPES).optional(), scope: demoScope }), req.query);
    const filter = {};
    const staff = isStaff(req.user);
    if (!staff) filter.reporter = req.user._id;
    else if (q.scope !== 'all') filter.isDemo = q.scope === 'demo';
    if (q.status) filter.status = q.status;
    if (q.type) filter.type = q.type;
    const [items, total] = await Promise.all([
      Incident.find(filter)
        .sort({ updatedAt: -1 })
        .skip((q.page - 1) * q.pageSize)
        .limit(q.pageSize)
        .populate('baggage', 'reference description')
        .populate('reporter', 'name')
        .lean(),
      Incident.countDocuments(filter),
    ]);
    res.json({ items: items.map((i) => toIncidentDTO(i, staff)), page: q.page, pageSize: q.pageSize, total });
  });

  r.post('/', async (req, res) => {
    const body = parse(z.object({ reference: z.string().max(40), type: z.enum(INCIDENT_TYPES), description: z.string().trim().min(10).max(2000) }), req.body);
    const bag = await loadAccessibleBag(req, body.reference);
    const open = await Incident.countDocuments({ baggage: bag._id, type: body.type, status: { $in: ['OPEN', 'INVESTIGATING'] } });
    if (open > 0) throw conflict('DUPLICATE_INCIDENT', 'An open incident of this type already exists for this bag.');
    const incident = await Incident.create({
      baggage: bag._id,
      reporter: req.user._id,
      type: body.type,
      description: body.description,
      isDemo: bag.isDemo,
      history: [{ by: req.user._id, byName: req.user.name, text: 'Incident reported.', status: 'OPEN', at: ctx.now() }],
    });
    // Reflect the report on the bag unless it was already collected (damage reports after collection keep COLLECTED).
    if (bag.status !== 'COLLECTED' && bag.status !== 'INCIDENT_REPORTED') {
      await changeStatus(ctx, req.user, bag, 'INCIDENT_REPORTED', `Incident: ${body.type}`, 'incident');
    }
    await audit(req.user, 'incident.created', { type: 'incident', id: String(incident._id) }, { type: body.type }, bag.isDemo);
    await incident.populate('baggage', 'reference description');
    res.status(201).json({ incident: toIncidentDTO(incident, false) });
  });

  r.get('/:id', async (req, res) => {
    const id = parse(objectId, req.params.id);
    const incident = await Incident.findById(id).populate('baggage', 'reference description').populate('reporter', 'name').lean();
    if (!incident || (!isStaff(req.user) && String(incident.reporter?._id) !== String(req.user._id))) throw notFound('Incident');
    res.json({ incident: toIncidentDTO(incident, isStaff(req.user)) });
  });

  r.post('/:id/notes', requireRole('staff', 'admin'), async (req, res) => {
    const id = parse(objectId, req.params.id);
    const body = parse(z.object({ text: z.string().trim().min(1).max(1000), status: z.enum(INCIDENT_STATUSES).optional() }), req.body);
    const incident = await Incident.findById(id).populate('baggage', 'reference description');
    if (!incident) throw notFound('Incident');
    incident.history.push({ by: req.user._id, byName: req.user.name, text: body.text, status: body.status ?? null, at: ctx.now() });
    if (body.status) incident.status = body.status;
    await incident.save();
    const ref = incident.baggage?.reference;
    await notify(ctx, {
      userId: incident.reporter,
      kind: 'INCIDENT_UPDATE',
      title: body.status ? `Incident ${body.status.toLowerCase()}` : 'Incident updated',
      body: `Your ${incident.type.toLowerCase()} report for ${ref} was updated: ${body.text}`,
      link: `/incidents/${incident._id}`,
      dedupeKey: `incident:${incident._id}:${incident.history.length}`,
      isDemo: incident.isDemo,
    });
    await audit(req.user, 'incident.updated', { type: 'incident', id: String(incident._id) }, { status: body.status }, incident.isDemo);
    res.json({ incident: toIncidentDTO(incident, true) });
  });

  return r;
}
