import { Schema, model } from 'mongoose';

const predictionRecordSchema = new Schema(
  {
    baggage: { type: Schema.Types.ObjectId, ref: 'Baggage', required: true },
    method: { type: String, enum: ['rules-baseline', 'logistic-regression'], required: true },
    risk: { type: Number, required: true, min: 0, max: 1 },
    level: { type: String, enum: ['low', 'medium', 'high'], required: true },
    features: { type: Schema.Types.Mixed, required: true },
    factors: { type: Schema.Types.Mixed, default: [] },
    modelVersion: { type: String, default: null },
    // Filled in later (when the bag reaches a terminal state) to build training labels.
    outcomeDelayed: { type: Boolean, default: null },
    computedAt: { type: Date, default: () => new Date() },
    isDemo: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);
predictionRecordSchema.index({ baggage: 1, computedAt: -1 });

export const PredictionRecord = model('PredictionRecord', predictionRecordSchema);
