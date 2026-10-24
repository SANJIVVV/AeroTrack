import { Schema, model } from 'mongoose';

/**
 * One-time 6-digit codes for email verification and password reset.
 * Only an HMAC of the code is stored, never the code itself.
 */
const otpChallengeSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    purpose: { type: String, enum: ['verify-email', 'reset-password'], required: true },
    codeHash: { type: String, required: true },
    sentAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
otpChallengeSchema.index({ user: 1, purpose: 1, sentAt: -1 });
// Remove old challenges a day after they expire.
otpChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 86_400 });

export const OtpChallenge = model('OtpChallenge', otpChallengeSchema);
