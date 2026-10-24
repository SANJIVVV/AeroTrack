import { Router } from 'express';
import { z } from 'zod';
import { FLIGHT_STATUSES, findAirline } from '@aerotrack/shared';

import { Baggage, Flight } from '../models/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { demoScope, escapeRegex, objectId, pagination, parse } from '../validators/common.js';
import { toFlightDTO } from '../services/serializers.js';
import { audit } from '../services/audit.js';
import { notFound } from '../utils/errors.js';

export function flightRoutes(ctx) {
  const r = Router();

  r.get('/', requireAuth, async (req, res) => {
    const q = parse(
      pagination.extend({
        search: z.string().trim().max(20).optional(),
        airline: z.string().trim().max(3).optional(),
        scope: demoScope.default('all'),
        upcoming: z.enum(['true', 'false']).optional(),
      }),
      req.query,
    );
    const filter = {};
    if (q.scope !== 'all') filter.isDemo = q.scope === 'demo';
    if (q.airline) filter.airlineCode = q.airline.toUpperCase();
    if (q.search) {
      const rx = new RegExp(escapeRegex(q.search), 'i');
      filter.$or = [{ flightNumber: rx }, { origin: rx }, { destination: rx }, { airlineName: rx }];
    }
    if (q.upcoming === 'true') filter.scheduledDeparture = { $gte: new Date(ctx.now().getTime() - 6 * 3600_000) };
    const [items, total] = await Promise.all([
      Flight.find(filter)
        .sort({ scheduledDeparture: 1 })
        .skip((q.page - 1) * q.pageSize)
        .limit(q.pageSize)
        .lean(),
      Flight.countDocuments(filter),
    ]);
    res.json({ items: items.map(toFlightDTO), page: q.page, pageSize: q.pageSize, total });
  });

  r.get('/:id', requireAuth, async (req, res) => {
    const id = parse(objectId, req.params.id);
    const flight = await Flight.findById(id).lean();
    if (!flight) throw notFound('Flight');
    const baggageCount = req.user.role === 'passenger' ? await Baggage.countDocuments({ flight: id, owner: req.user._id }) : await Baggage.countDocuments({ flight: id });
    res.json({ flight: toFlightDTO(flight), baggageCount, airline: findAirline(flight.airlineCode) ?? null });
  });

  // Staff can enter a flight manually (labelled "manual").
  r.post('/', requireRole('staff', 'admin'), async (req, res) => {
    const data = parse(
      z
        .object({
          airlineCode: z
            .string()
            .trim()
            .regex(/^[A-Z0-9]{2,3}$/i),
          airlineName: z.string().trim().min(2).max(100),
          flightNumber: z
            .string()
            .trim()
            .regex(/^[A-Z0-9]{2}\d{1,4}[A-Z]?$/i),
          origin: z
            .string()
            .trim()
            .regex(/^[A-Z]{3}$/i),
          destination: z
            .string()
            .trim()
            .regex(/^[A-Z]{3}$/i),
          scheduledDeparture: z.coerce.date(),
          scheduledArrival: z.coerce.date(),
          status: z.enum(FLIGHT_STATUSES).default('SCHEDULED'),
          gate: z
            .string()
            .trim()
            .regex(/^[A-Z0-9]{1,6}$/i)
            .optional(),
          baggageBelt: z
            .string()
            .trim()
            .regex(/^[A-Z0-9]{1,4}$/i)
            .optional(),
        })
        .refine((d) => d.scheduledArrival > d.scheduledDeparture, { message: 'Arrival must be after departure', path: ['scheduledArrival'] })
        .refine((d) => d.origin.toUpperCase() !== d.destination.toUpperCase(), { message: 'Origin and destination must differ', path: ['destination'] }),
      req.body,
    );
    const flight = await Flight.create({ ...data, source: 'manual', lastRefreshedAt: ctx.now(), isDemo: false });
    await audit(req.user, 'flight.created', { type: 'flight', id: flight.flightNumber });
    res.status(201).json({ flight: toFlightDTO(flight) });
  });

  r.patch('/:id', requireRole('staff', 'admin'), async (req, res) => {
    const id = parse(objectId, req.params.id);
    const data = parse(
      z
        .object({
          status: z.enum(FLIGHT_STATUSES).optional(),
          gate: z
            .string()
            .trim()
            .regex(/^[A-Z0-9]{1,6}$/i)
            .nullable()
            .optional(),
          baggageBelt: z
            .string()
            .trim()
            .regex(/^[A-Z0-9]{1,4}$/i)
            .nullable()
            .optional(),
        })
        .refine((d) => d.status !== undefined || d.gate !== undefined || d.baggageBelt !== undefined, { message: 'Nothing to update' }),
      req.body,
    );
    const flight = await Flight.findOneAndUpdate({ _id: id, source: { $in: ['manual', 'demo'] } }, { ...data, lastRefreshedAt: ctx.now() }, { new: true });
    if (!flight) throw notFound('Editable flight');
    await audit(req.user, 'flight.updated', { type: 'flight', id: flight.flightNumber }, data, flight.isDemo);
    res.json({ flight: toFlightDTO(flight) });
  });

  return r;
}
