import { Schema, model } from 'mongoose';
import { BAGGAGE_STATUSES, DATA_SOURCES } from '@aerotrack/shared';

const baggageEventSchema = new Schema(
  {
    baggage: { type: Schema.Types.ObjectId, ref: 'Baggage', required: true },
    status: { type: String, enum: BAGGAGE_STATUSES, required: true },
    previousStatus: { type: String, enum: BAGGAGE_STATUSES, default: null },
    checkpoint: { type: Schema.Types.ObjectId, ref: 'Checkpoint', default: null },
    actor: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    actorRole: { type: String, enum: ['passenger', 'staff', 'admin', 'system'], default: null },
    method: { type: String, enum: ['qr', 'manual', 'status-update', 'board', 'admin-override', 'incident', 'system'], required: true },
    note: { type: String, maxlength: 500, default: null },
    source: { type: String, enum: DATA_SOURCES, default: 'verified' },
    // Client-generated id so a retried scan request is processed only once.
    idempotencyKey: { type: String, default: undefined },
    occurredAt: { type: Date, default: () => new Date() },
    isDemo: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);
baggageEventSchema.index({ baggage: 1, occurredAt: -1 });
baggageEventSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });
baggageEventSchema.index({ occurredAt: -1 });

export const BaggageEvent = model('BaggageEvent', baggageEventSchema);
