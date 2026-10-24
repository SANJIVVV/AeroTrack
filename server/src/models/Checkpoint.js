import { Schema, model } from 'mongoose';
import { CHECKPOINT_TYPE_LIST } from '@aerotrack/shared';

const checkpointSchema = new Schema(
  {
    code: { type: String, required: true, uppercase: true, trim: true, maxlength: 32 },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    airport: { type: String, required: true, uppercase: true, trim: true, maxlength: 4 },
    type: { type: String, enum: CHECKPOINT_TYPE_LIST, required: true },
    // Reserved for future hardware integrations; only 'qr' and 'manual' are implemented.
    readerKind: { type: String, enum: ['qr', 'manual', 'rfid'], default: 'qr' },
    active: { type: Boolean, default: true },
    isDemo: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);
checkpointSchema.index({ code: 1 }, { unique: true });

export const Checkpoint = model('Checkpoint', checkpointSchema);
