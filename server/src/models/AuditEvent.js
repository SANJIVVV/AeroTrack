import { Schema, model } from 'mongoose';

const auditEventSchema = new Schema(
  {
    actor: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    actorRole: { type: String, default: null },
    action: { type: String, required: true, maxlength: 80, index: true },
    targetType: { type: String, maxlength: 40, default: null },
    targetId: { type: String, maxlength: 80, default: null },
    meta: { type: Schema.Types.Mixed, default: {} },
    at: { type: Date, default: () => new Date() },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: false },
);
// Retention: audit entries are kept for 365 days.
auditEventSchema.index({ at: 1 }, { expireAfterSeconds: 365 * 24 * 3600 });

export const AuditEvent = model('AuditEvent', auditEventSchema);
