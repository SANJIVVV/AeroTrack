import { STATUS_LABELS, checkTransition, evaluateScan, evaluateScanFailures, isMainFlow, normalizeReference, parseQrPayload } from '@aerotrack/shared';

import { AuditEvent, Baggage, BaggageEvent, Checkpoint, PredictionRecord } from '../models/index.js';
import { AppError, badRequest, conflict, notFound } from '../utils/errors.js';
import { raiseAlert } from './alerts.js';
import { audit } from './audit.js';
import { notify } from './notifications.js';
import { recordPrediction } from './prediction.js';

async function recordScanFailure(ctx, actor, checkpointCode, reason) {
  await audit(actor, 'scan.failed', { type: 'checkpoint', id: checkpointCode }, { reason, checkpointCode });
  const since = new Date(ctx.now().getTime() - 15 * 60000);
  const failures = await AuditEvent.find({ action: 'scan.failed', 'meta.checkpointCode': checkpointCode, at: { $gte: since } }).lean();
  const finding = evaluateScanFailures(
    failures.map((f) => ({ at: f.at, checkpointCode, actorId: f.actor ? String(f.actor) : null })),
    ctx.now(),
  );
  if (finding) {
    // One open alert per checkpoint per 10-minute bucket.
    const bucket = Math.floor(ctx.now().getTime() / 600_000);
    await raiseAlert(finding, null, ctx.now(), `scanfail:${checkpointCode}:${bucket}`);
  }
}

const NOTIFY_FOR = {
  CHECKED_IN: { kind: 'STATUS_CHANGE', title: 'Bag checked in' },
  LOADED: { kind: 'STATUS_CHANGE', title: 'Bag loaded onto aircraft' },
  ARRIVED: { kind: 'ARRIVAL', title: 'Bag arrived at destination' },
  ON_BELT: { kind: 'READY_FOR_COLLECTION', title: 'Bag is on the baggage belt' },
  DELAYED: { kind: 'STATUS_CHANGE', title: 'Bag delayed' },
  MISSING: { kind: 'STATUS_CHANGE', title: 'Bag could not be located' },
  COLLECTED: { kind: 'STATUS_CHANGE', title: 'Bag collected' },
};

async function applyStatus(ctx, bag, status, opts) {
  const now = ctx.now();
  const previous = bag.status;
  const update = { status, $inc: { version: 1, skippedCheckpoints: opts.skipped } };
  if (isMainFlow(status)) update.lastMainStatus = status;
  if (opts.checkpoint) {
    update.lastScanAt = now;
    update.lastCheckpoint = opts.checkpoint._id;
  }
  // Optimistic concurrency: if another scan changed the bag meanwhile, refuse.
  const updated = await Baggage.findOneAndUpdate({ _id: bag._id, version: bag.version }, update, { new: true }).populate('flight');
  if (!updated) throw conflict('CONCURRENT_UPDATE', 'The bag was updated by another scan. Please scan again.');

  const event = await BaggageEvent.create({
    baggage: bag._id,
    status,
    previousStatus: previous,
    checkpoint: opts.checkpoint?._id ?? null,
    actor: opts.actor?._id ?? null,
    actorRole: opts.actor?.role ?? 'system',
    method: opts.method,
    note: opts.note ?? null,
    source: bag.isDemo ? 'simulated' : 'verified',
    idempotencyKey: opts.idempotencyKey,
    occurredAt: now,
    isDemo: !!bag.isDemo,
  });

  const n = NOTIFY_FOR[status];
  if (n) {
    await notify(ctx, {
      userId: bag.owner,
      kind: n.kind,
      title: n.title,
      body: `${bag.reference} (${bag.description}) is now: ${STATUS_LABELS[status]}${opts.checkpoint ? ` at ${opts.checkpoint.name}` : ''}.`,
      link: `/baggage/${bag.reference}`,
      dedupeKey: `status:${event._id}`,
      isDemo: !!bag.isDemo,
    });
  }

  if (status === 'COLLECTED') await labelOutcome(bag._id, updated);

  const estimate = await recordPrediction(ctx, updated);
  if (estimate.level === 'high' && status !== 'COLLECTED') {
    await notify(ctx, {
      userId: bag.owner,
      kind: 'DELAY_RISK',
      title: 'Elevated delay risk',
      body: `${bag.reference} has an elevated estimated delay risk (${Math.round(estimate.risk * 100)}%, ${estimate.method}). This is an estimate, not a confirmed delay.`,
      link: `/baggage/${bag.reference}`,
      dedupeKey: `risk:${bag._id}:${updated.lastMainStatus}`,
      isDemo: !!bag.isDemo,
    });
  }
  return { bag: updated, event };
}

/**
 * Training labels: once a bag is collected, earlier predictions for it are
 * labelled "delayed" if it ever entered DELAYED/MISSING or was collected more
 * than 60 minutes after the flight's scheduled arrival.
 */
async function labelOutcome(bagId, bag) {
  const hadException = await BaggageEvent.exists({ baggage: bagId, status: { $in: ['DELAYED', 'MISSING'] } });
  const arrival = bag.flight?.scheduledArrival;
  const late = arrival && bag.lastScanAt ? bag.lastScanAt.getTime() - arrival.getTime() > 60 * 60000 : false;
  await PredictionRecord.updateMany({ baggage: bagId, outcomeDelayed: null }, { outcomeDelayed: !!hadException || late });
}

export async function processScan(ctx, actor, req) {
  const checkpoint = await Checkpoint.findOne({ code: req.checkpointCode.toUpperCase(), active: true });
  if (!checkpoint) throw badRequest('Unknown or inactive checkpoint.');

  const reference = req.qrPayload ? parseQrPayload(req.qrPayload) : req.reference ? normalizeReference(req.reference) : null;
  if (!reference) {
    await recordScanFailure(ctx, actor, checkpoint.code, req.qrPayload ? 'invalid-qr' : 'invalid-reference');
    throw new AppError(400, 'INVALID_QR', 'This code is not a valid AeroTrack baggage tag.');
  }

  const bag = await Baggage.findOne({ reference }).populate('flight');
  if (!bag) {
    await recordScanFailure(ctx, actor, checkpoint.code, 'unknown-reference');
    throw notFound('Baggage');
  }
  if (!!bag.isDemo !== !!checkpoint.isDemo) {
    throw badRequest(bag.isDemo ? 'Demo baggage can only be scanned at demo checkpoints.' : 'Operational baggage cannot be scanned at a demo checkpoint.');
  }

  if (req.idempotencyKey) {
    const existing = await BaggageEvent.findOne({ idempotencyKey: req.idempotencyKey });
    if (existing) return { outcome: 'duplicate', bag, findings: [], event: existing };
  }

  const recent = await BaggageEvent.find({ baggage: bag._id }).sort({ occurredAt: -1, _id: -1 }).limit(10).populate('checkpoint').lean();
  const flight = bag.flight;
  const evaluation = evaluateScan({
    bag: { status: bag.status, lastMainStatus: bag.lastMainStatus },
    checkpoint: { code: checkpoint.code, type: checkpoint.type, airport: checkpoint.airport },
    requestedStatus: req.status,
    flight: flight?.origin ? { origin: flight.origin, destination: flight.destination } : null,
    recentEvents: recent.map((e) => ({ status: e.status, checkpointCode: e.checkpoint?.code ?? null, occurredAt: e.occurredAt })),
    now: ctx.now(),
  });

  for (const f of evaluation.findings) {
    const key = f.type === 'DUPLICATE_SCAN' ? `dup:${bag._id}:${checkpoint.code}:${evaluation.status}` : undefined;
    await raiseAlert(f, bag, ctx.now(), key);
  }

  if (evaluation.action === 'duplicate') {
    await audit(actor, 'scan.duplicate', { type: 'baggage', id: reference }, { checkpoint: checkpoint.code }, !!bag.isDemo);
    return { outcome: 'duplicate', bag, findings: evaluation.findings, event: null };
  }
  if (evaluation.action === 'reject') {
    await audit(actor, 'scan.rejected', { type: 'baggage', id: reference }, { checkpoint: checkpoint.code, reason: evaluation.reason }, !!bag.isDemo);
    throw conflict('INVALID_TRANSITION', `Cannot move ${reference} from ${STATUS_LABELS[bag.status]} to ${STATUS_LABELS[evaluation.status]}.`, {
      findings: evaluation.findings,
    });
  }

  const skipped = evaluation.findings.filter((f) => f.type === 'MISSING_CHECKPOINT').reduce((n, f) => n + (f.evidence.skipped?.length ?? 0), 0);
  const result = await applyStatus(ctx, bag, evaluation.status, {
    actor,
    checkpoint,
    method: req.qrPayload ? 'qr' : 'manual',
    note: req.note,
    idempotencyKey: req.idempotencyKey,
    skipped,
  });
  await audit(actor, 'scan.recorded', { type: 'baggage', id: reference }, { checkpoint: checkpoint.code, status: evaluation.status }, !!bag.isDemo);
  return { outcome: 'recorded', bag: result.bag, findings: evaluation.findings, event: result.event };
}

/** Status change without a checkpoint scan (e.g. staff marks a bag Delayed). */
export async function changeStatus(ctx, actor, bag, status, note, method = 'status-update') {
  const verdict = checkTransition(bag.status, status, bag.lastMainStatus);
  if (!verdict.ok) {
    throw conflict('INVALID_TRANSITION', `Cannot move ${bag.reference} from ${STATUS_LABELS[bag.status]} to ${STATUS_LABELS[status]}.`);
  }
  if (isMainFlow(status) && verdict.skipped.length > 0) {
    throw conflict('SCAN_REQUIRED', 'Main journey steps must be recorded by scanning at a checkpoint.');
  }
  const result = await applyStatus(ctx, bag, status, { actor, checkpoint: null, method, note, skipped: 0 });
  await audit(actor, 'baggage.status', { type: 'baggage', id: bag.reference }, { status, method }, !!bag.isDemo);
  return result;
}

/**
 * Administrator correction: sets any status, including a backward move,
 * bypassing the transition rules. Requires a written reason, is recorded as
 * an 'admin-override' event and audited with the previous status.
 */
export async function overrideStatus(ctx, admin, bag, status, reason) {
  if (bag.status === status) throw conflict('SAME_STATUS', `${bag.reference} is already ${STATUS_LABELS[status]}.`);
  const previous = bag.status;
  const result = await applyStatus(ctx, bag, status, { actor: admin, checkpoint: null, method: 'admin-override', note: `Admin correction: ${reason}`, skipped: 0 });
  // A correction may move the bag backwards, so lastMainStatus follows the new status.
  if (isMainFlow(status) && result.bag.lastMainStatus !== status) {
    result.bag.lastMainStatus = status;
    await result.bag.save();
  }
  await audit(admin, 'baggage.override', { type: 'baggage', id: bag.reference }, { from: previous, to: status, reason }, !!bag.isDemo);
  return result;
}
