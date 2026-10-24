import { Schema, model } from 'mongoose';
import { NOTIFICATION_KINDS } from '@aerotrack/shared';

const notificationSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    kind: { type: String, enum: NOTIFICATION_KINDS, required: true },
    title: { type: String, required: true, maxlength: 200 },
    body: { type: String, required: true, maxlength: 1000 },
    link: { type: String, maxlength: 300, default: null },
    readAt: { type: Date, default: null },
    // Prevents the same event notifying a user twice.
    dedupeKey: { type: String, required: true },
    email: {
      status: { type: String, enum: ['sent', 'failed', 'skipped', 'dev-outbox', 'disabled'], default: 'skipped' },
      error: { type: String, default: null, maxlength: 300 },
      attemptedAt: { type: Date, default: null },
    },
    isDemo: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ dedupeKey: 1 }, { unique: true });

export const Notification = model('Notification', notificationSchema);
