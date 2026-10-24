import { Schema, model } from 'mongoose';
import { BAGGAGE_STATUSES, MAIN_FLOW } from '@aerotrack/shared';

const baggageSchema = new Schema(
  {
    reference: { type: String, required: true },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    flight: { type: Schema.Types.ObjectId, ref: 'Flight', default: null, index: true },
    description: { type: String, required: true, trim: true, maxlength: 200 },
    color: { type: String, trim: true, maxlength: 40, default: '' },
    weightKg: { type: Number, min: 0, max: 100, default: null },
    status: { type: String, enum: BAGGAGE_STATUSES, default: 'REGISTERED', index: true },
    lastMainStatus: { type: String, enum: MAIN_FLOW, default: 'REGISTERED' },
    lastScanAt: { type: Date, default: null },
    lastCheckpoint: { type: Schema.Types.ObjectId, ref: 'Checkpoint', default: null },
    skippedCheckpoints: { type: Number, default: 0 },
    version: { type: Number, default: 0 },
    isDemo: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);
baggageSchema.index({ reference: 1 }, { unique: true });
baggageSchema.index({ status: 1, lastScanAt: 1 });

export const Baggage = model('Baggage', baggageSchema);
