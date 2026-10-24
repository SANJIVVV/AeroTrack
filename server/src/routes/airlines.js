import { Router } from 'express';
import { z } from 'zod';
import { AIRLINE_REGIONS } from '@aerotrack/shared';

import { Airline, Flight } from '../models/index.js';
import { escapeRegex, parse } from '../validators/common.js';
import { toFlightDTO } from '../services/serializers.js';
import { notFound } from '../utils/errors.js';

const NOTICE = 'Demonstration directory. Not a partnership with, or live data from, any airline. Sample flights are generated for the demo.';

const toAirline = (a, featured = null) => ({
  code: a.code,
  name: a.name,
  country: a.country,
  region: a.region,
  hub: a.hub,
  description: a.description,
  officialSite: a.officialSite,
  image: a.image,
  photoMatchesAirline: !!a.photoMatchesAirline,
  featuredFlight: featured,
});

/** Public, read-only airline directory backed by MongoDB (seeded from shared/src/airlines.ts). */
export function airlineRoutes(_ctx) {
  const r = Router();

  r.get('/', async (req, res) => {
    const q = parse(z.object({ search: z.string().trim().max(60).optional(), region: z.enum(AIRLINE_REGIONS).optional() }), req.query);
    const filter = { active: { $ne: false } };
    if (q.region) filter.region = q.region;
    if (q.search) {
      const rx = new RegExp(escapeRegex(q.search), 'i');
      filter.$or = [{ name: rx }, { country: rx }, { code: rx }];
    }
    const items = await Airline.find(filter).sort({ name: 1 }).lean();
    const featured = await Flight.find({ isDemo: true, flightNumber: { $in: items.map((a) => a.featuredFlightNumber).filter(Boolean) } }).lean();
    const byNumber = new Map(featured.map((f) => [f.flightNumber, toFlightDTO(f)]));
    res.json({ items: items.map((a) => toAirline(a, byNumber.get(a.featuredFlightNumber ?? '') ?? null)), notice: NOTICE });
  });

  r.get('/:code', async (req, res) => {
    const code = parse(
      z
        .string()
        .trim()
        .regex(/^[A-Z0-9]{2,3}$/i),
      req.params.code,
    ).toUpperCase();
    const airline = await Airline.findOne({ code, active: { $ne: false } }).lean();
    if (!airline) throw notFound('Airline');
    const flights = await Flight.find({ airlineCode: code, isDemo: true }).sort({ featured: -1, scheduledDeparture: 1 }).limit(20).lean();
    const featured = flights.find((f) => f.flightNumber === airline.featuredFlightNumber);
    res.json({ airline: toAirline(airline, featured ? toFlightDTO(featured) : null), flights: flights.map(toFlightDTO), notice: NOTICE });
  });

  return r;
}
