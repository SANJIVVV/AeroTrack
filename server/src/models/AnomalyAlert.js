import { Schema, model } from 'mongoose';
import { ALERT_STATUSES, ANOMALY_TYPES, SEVERITIES } from '@aerotrack/shared';

const alertNoteSchema = new Schema(
  {
    by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    byName: { type: String, required: true },
    text: { type: String, maxlength: 1000, default: '' },
    status: { type: String, enum: ALERT_STATUSES, required: true },
    at: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

const anomalyAlertSchema = new Schema(
  {
    baggage: { type: Schema.Types.ObjectId, ref: 'Baggage', default: null, index: true },
    reference: { type: String, default: null },
    type: { type: String, enum: ANOMALY_TYPES, required: true },
    severity: { type: String, enum: SEVERITIES, required: true },
    reason: { type: String, required: true, maxlength: 500 },
    evidence: { type: Schema.Types.Mixed, default: {} },
    recommendedAction: { type: String, required: true, maxlength: 500 },
    status: { type: String, enum: ALERT_STATUSES, default: 'OPEN', index: true },
    detectedAt: { type: Date, default: () => new Date() },
    history: { type: [alertNoteSchema], default: [] },
    // Open alerts of the same kind for the same bag/stage are not duplicated.
    dedupeKey: { type: String, default: undefined },
    isDemo: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);
anomalyAlertSchema.index({ detectedAt: -1 });
anomalyAlertSchema.index({ dedupeKey: 1 }, { unique: true, sparse: true });

export const AnomalyAlert = model('AnomalyAlert', anomalyAlertSchema);
