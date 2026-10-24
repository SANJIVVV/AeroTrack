import { Schema, model } from 'mongoose';
import { INCIDENT_STATUSES, INCIDENT_TYPES } from '@aerotrack/shared';

const noteSchema = new Schema(
  {
    by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    byName: { type: String, required: true },
    text: { type: String, required: true, maxlength: 1000 },
    status: { type: String, enum: INCIDENT_STATUSES, default: null },
    at: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

const incidentSchema = new Schema(
  {
    baggage: { type: Schema.Types.ObjectId, ref: 'Baggage', required: true, index: true },
    reporter: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: INCIDENT_TYPES, required: true },
    description: { type: String, required: true, maxlength: 2000 },
    status: { type: String, enum: INCIDENT_STATUSES, default: 'OPEN', index: true },
    assignee: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    history: { type: [noteSchema], default: [] },
    isDemo: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

export const Incident = model('Incident', incidentSchema);
