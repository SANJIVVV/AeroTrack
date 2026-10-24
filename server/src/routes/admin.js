import { Router } from 'express';
import { z } from 'zod';
import { BAGGAGE_STATUSES, ROLES } from '@aerotrack/shared';

import { AnomalyAlert, AuditEvent, Baggage, BaggageEvent, Incident, Session, User } from '../models/index.js';
import { requireRole } from '../middleware/auth.js';
import { demoScope, escapeRegex, objectId, pagination, parse } from '../validators/common.js';
import { toPublicUser } from '../services/serializers.js';
import { badRequest, notFound } from '../utils/errors.js';
import { audit } from '../services/audit.js';

export function adminRoutes(ctx) {
  const r = Router();

  // Analytics are available to staff and admins.
  r.get('/analytics', requireRole('staff', 'admin'), async (req, res) => {
    const q = parse(
      z.object({
        scope: demoScope,
        days: z.coerce.number().int().min(1).max(90).default(14),
        flight: objectId.optional(),
        checkpoint: z.string().max(32).optional(),
        status: z.enum(BAGGAGE_STATUSES).optional(),
      }),
      req.query,
    );
    const demo = q.scope === 'all' ? {} : { isDemo: q.scope === 'demo' };
    const since = new Date(ctx.now().getTime() - q.days * 86400_000);
    const bagFilter = { ...demo };
    if (q.flight) bagFilter.flight = q.flight;
    if (q.status) bagFilter.status = q.status;

    const bags = await Baggage.find(bagFilter, { status: 1 }).lean();
    const bagIds = bags.map((b) => b._id);
    const byStatus = Object.fromEntries(BAGGAGE_STATUSES.map((s) => [s, 0]));
    for (const b of bags) byStatus[b.status] = (byStatus[b.status] ?? 0) + 1;
    const inProgress = bags.filter((b) => !['REGISTERED', 'COLLECTED'].includes(b.status)).length;

    const eventFilter = { ...demo, occurredAt: { $gte: since }, baggage: { $in: bagIds } };
    const events = await BaggageEvent.find(eventFilter, { baggage: 1, status: 1, occurredAt: 1, checkpoint: 1 }).populate('checkpoint', 'code name').sort({ occurredAt: 1, _id: 1 }).limit(20000).lean();
    const filteredEvents = q.checkpoint ? events.filter((e) => e.checkpoint?.code === q.checkpoint) : events;

    const day = (d) => d.toISOString().slice(0, 10);
    const days = [];
    for (let i = q.days - 1; i >= 0; i--) days.push(day(new Date(ctx.now().getTime() - i * 86400_000)));
    const scansPerDay = Object.fromEntries(days.map((d) => [d, 0]));
    const checkpointActivity = {};
    for (const e of filteredEvents) {
      if (!e.checkpoint) continue;
      const k = day(e.occurredAt);
      if (k in scansPerDay) scansPerDay[k]++;
      const c = (checkpointActivity[e.checkpoint.code] ??= { code: e.checkpoint.code, name: e.checkpoint.name, scans: 0 });
      c.scans++;
    }

    // Processing-time trend: average minutes from check-in to loading, per day of check-in.
    const firstAt = {};
    for (const e of events) {
      const m = (firstAt[String(e.baggage)] ??= {});
      m[e.status] ??= e.occurredAt;
    }
    const processing = {};
    for (const m of Object.values(firstAt)) {
      if (m.CHECKED_IN && m.LOADED) {
        const k = day(m.CHECKED_IN);
        const p = (processing[k] ??= { total: 0, n: 0 });
        p.total += (m.LOADED.getTime() - m.CHECKED_IN.getTime()) / 60000;
        p.n++;
      }
    }

    const alertFilter = { ...demo, detectedAt: { $gte: since } };
    const alerts = await AnomalyAlert.find(alertFilter, { type: 1, severity: 1, status: 1 }).lean();
    const anomaliesByType = {};
    for (const a of alerts) anomaliesByType[a.type] = (anomaliesByType[a.type] ?? 0) + 1;

    const [openIncidents, scanFailures] = await Promise.all([
      Incident.countDocuments({ ...demo, status: { $in: ['OPEN', 'INVESTIGATING'] } }),
      AuditEvent.countDocuments({ action: 'scan.failed', at: { $gte: since } }),
    ]);

    res.json({
      scope: q.scope,
      generatedAt: ctx.now().toISOString(),
      kpis: {
        totalBaggage: bags.length,
        inProgress,
        inTransit: byStatus.IN_TRANSIT ?? 0,
        collected: byStatus.COLLECTED ?? 0,
        delayed: byStatus.DELAYED ?? 0,
        missing: byStatus.MISSING ?? 0,
        openIncidents,
        scanFailures,
        activeAlerts: alerts.filter((a) => a.status !== 'RESOLVED').length,
      },
      byStatus,
      scansPerDay: days.map((d) => ({ date: d, scans: scansPerDay[d] ?? 0 })),
      checkpointActivity: Object.values(checkpointActivity).sort((a, b) => b.scans - a.scans),
      anomaliesByType,
      processingTrend: days.map((d) => ({ date: d, avgCheckinToLoadMin: processing[d] ? Math.round(processing[d].total / processing[d].n) : null })),
      notes: { scanFailures: 'Scan failures are counted across all scopes because a failed scan has no bag to classify.' },
    });
  });

  r.use(requireRole('admin'));

  r.get('/users', async (req, res) => {
    const q = parse(pagination.extend({ search: z.string().trim().max(100).optional(), role: z.enum(ROLES).optional(), status: z.enum(['active', 'disabled']).optional() }), req.query);
    const filter = { isDemo: false };
    if (q.role) filter.role = q.role;
    if (q.status) filter.disabled = q.status === 'disabled' ? true : { $ne: true };
    if (q.search) {
      const rx = new RegExp(escapeRegex(q.search), 'i');
      filter.$or = [{ name: rx }, { email: rx }];
    }
    const [items, total] = await Promise.all([
      User.find(filter)
        .sort({ createdAt: -1 })
        .skip((q.page - 1) * q.pageSize)
        .limit(q.pageSize),
      User.countDocuments(filter),
    ]);
    res.json({ items: items.map((u) => ({ ...toPublicUser(u), disabled: u.disabled, lastLoginAt: u.lastLoginAt })), page: q.page, pageSize: q.pageSize, total });
  });

  r.patch('/users/:id', async (req, res) => {
    const id = parse(objectId, req.params.id);
    const body = parse(z.object({ role: z.enum(ROLES).optional(), disabled: z.boolean().optional() }), req.body);
    if (id === String(req.user._id)) throw badRequest('You cannot change your own role or disable yourself.');
    const user = await User.findOne({ _id: id, isDemo: false });
    if (!user) throw notFound('User');
    if (body.role) user.role = body.role;
    if (body.disabled !== undefined) user.disabled = body.disabled;
    await user.save();
    if (body.disabled || body.role) await Session.deleteMany({ user: user._id }); // force re-login with new rights
    await audit(req.user, 'admin.user_updated', { type: 'user', id }, body);
    res.json({ user: { ...toPublicUser(user), disabled: user.disabled } });
  });

  // Headline numbers for the admin overview, straight from MongoDB.
  r.get('/stats', async (req, res) => {
    const q = parse(z.object({ scope: demoScope }), req.query);
    const bagFilter = q.scope === 'all' ? {} : { isDemo: q.scope === 'demo' };
    const [users, totalBags, byStatus, recent] = await Promise.all([
      User.countDocuments({ isDemo: false }),
      Baggage.countDocuments(bagFilter),
      Baggage.aggregate([{ $match: bagFilter }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
      AuditEvent.find(q.scope === 'all' ? {} : { isDemo: q.scope === 'demo' })
        .sort({ at: -1 })
        .limit(8)
        .populate('actor', 'name')
        .lean(),
    ]);
    const count = (s) => byStatus.find((b) => b._id === s)?.n ?? 0;
    res.json({
      users,
      totalBags,
      inTransit: count('IN_TRANSIT'),
      readyForCollection: count('ON_BELT'),
      delayed: count('DELAYED'),
      missing: count('MISSING'),
      byStatus: Object.fromEntries(byStatus.map((b) => [b._id, b.n])),
      recent: recent.map((a) => ({ id: String(a._id), action: a.action, actorName: a.actor?.name ?? null, targetId: a.targetId, at: a.at })),
    });
  });

  const auditList = async (req, res) => {
    const q = parse(pagination.extend({ action: z.string().max(80).optional() }), req.query);
    const filter = {};
    if (q.action) filter.action = new RegExp(`^${escapeRegex(q.action)}`);
    const [items, total] = await Promise.all([
      AuditEvent.find(filter)
        .sort({ at: -1 })
        .skip((q.page - 1) * q.pageSize)
        .limit(q.pageSize)
        .populate('actor', 'name')
        .lean(),
      AuditEvent.countDocuments(filter),
    ]);
    res.json({
      items: items.map((a) => ({
        id: String(a._id),
        action: a.action,
        actorName: a.actor?.name ?? null,
        actorRole: a.actorRole,
        targetType: a.targetType,
        targetId: a.targetId,
        meta: a.meta,
        at: a.at,
        isDemo: a.isDemo,
      })),
      page: q.page,
      pageSize: q.pageSize,
      total,
    });
  };
  r.get('/audit', auditList);
  r.get('/audit-logs', auditList);

  return r;
}
