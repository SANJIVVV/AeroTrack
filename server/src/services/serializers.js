import { toQrPayload } from '@aerotrack/shared';

const iso = (d) => (d instanceof Date ? d.toISOString() : null);

export function toPublicUser(u) {
  return {
    id: String(u._id),
    name: u.name,
    email: u.email,
    role: u.role,
    emailVerified: u.emailVerified,
    preferences: { emailNotifications: !!u.preferences?.emailNotifications, browserNotifications: !!u.preferences?.browserNotifications },
    createdAt: iso(u.createdAt) ?? '',
  };
}

export function toFlightDTO(f) {
  if (!f || !f.flightNumber) return null;
  return {
    id: String(f._id),
    airlineCode: f.airlineCode,
    airlineName: f.airlineName,
    flightNumber: f.flightNumber,
    origin: f.origin,
    destination: f.destination,
    scheduledDeparture: iso(f.scheduledDeparture) ?? '',
    scheduledArrival: iso(f.scheduledArrival) ?? '',
    status: f.status,
    gate: f.gate ?? null,
    baggageBelt: f.baggageBelt ?? null,
    source: f.source,
    lastRefreshedAt: iso(f.lastRefreshedAt),
    isDemo: !!f.isDemo,
  };
}

export function toBaggageDTO(b, opts = {}) {
  return {
    id: String(b._id),
    reference: b.reference,
    description: b.description,
    color: b.color ?? '',
    weightKg: b.weightKg ?? null,
    status: b.status,
    lastMainStatus: b.lastMainStatus,
    lastScanAt: iso(b.lastScanAt),
    lastCheckpointName: b.lastCheckpoint?.name ?? null,
    flight: toFlightDTO(b.flight),
    ...(opts.includeOwner && b.owner?.name ? { ownerName: b.owner.name } : {}),
    isDemo: !!b.isDemo,
    createdAt: iso(b.createdAt) ?? '',
    updatedAt: iso(b.updatedAt) ?? iso(b.createdAt) ?? '',
    version: b.version ?? 0,
    qrPayload: toQrPayload(b.reference),
  };
}

export function toEventDTO(e, opts) {
  return {
    id: String(e._id),
    status: e.status,
    checkpointCode: e.checkpoint?.code ?? null,
    checkpointName: e.checkpoint?.name ?? null,
    checkpointType: e.checkpoint?.type ?? null,
    // Passengers see the role only, not staff names.
    actorName: opts.showActor ? (e.actor?.name ?? null) : null,
    actorRole: e.actorRole ?? null,
    note: e.note ?? null,
    source: e.isDemo ? 'simulated' : e.source,
    occurredAt: iso(e.occurredAt) ?? '',
  };
}
