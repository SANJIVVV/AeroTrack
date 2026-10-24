import { OtpChallenge } from '../models/index.js';
import { hmac, randomOtp, safeEqualHex } from '../utils/crypto.js';
import { AppError } from '../utils/errors.js';

export const OTP_TTL_MS = 5 * 60_000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_MS = 60_000;

const hashCode = (ctx, challengeId, code) => hmac(ctx.env.SESSION_SECRET, `${challengeId}:${code}`);

/**
 * Issue a new code, invalidating older ones for the same purpose. Returns
 * null (and issues nothing) while the resend cooldown is running.
 */
export async function issueOtp(ctx, userId, purpose) {
  const now = ctx.now();
  const latest = await OtpChallenge.findOne({ user: userId, purpose }).sort({ sentAt: -1 });
  if (latest && now.getTime() - latest.sentAt.getTime() < OTP_RESEND_COOLDOWN_MS) return null;
  await OtpChallenge.updateMany({ user: userId, purpose, usedAt: null }, { usedAt: now });
  const code = randomOtp();
  const challenge = new OtpChallenge({ user: userId, purpose, codeHash: 'pending', sentAt: now, expiresAt: new Date(now.getTime() + OTP_TTL_MS) });
  challenge.codeHash = hashCode(ctx, String(challenge._id), code);
  await challenge.save();
  return code;
}

const invalid = () => new AppError(400, 'INVALID_CODE', 'That code is incorrect or has expired. Check the latest email or request a new code.');

/** Check a code. Wrong guesses count towards the attempt limit; success marks it used. */
export async function verifyOtp(ctx, userId, purpose, code) {
  if (!userId) throw invalid();
  const now = ctx.now();
  const challenge = await OtpChallenge.findOne({ user: userId, purpose, usedAt: null }).sort({ sentAt: -1 });
  if (!challenge || challenge.expiresAt <= now) throw invalid();
  if (challenge.attempts >= OTP_MAX_ATTEMPTS) throw new AppError(429, 'TOO_MANY_ATTEMPTS', 'Too many incorrect attempts. Request a new code.');
  if (!safeEqualHex(challenge.codeHash, hashCode(ctx, String(challenge._id), code))) {
    // Atomic increment so parallel guesses cannot exceed the limit unnoticed.
    await OtpChallenge.updateOne({ _id: challenge._id }, { $inc: { attempts: 1 } });
    throw invalid();
  }
  const used = await OtpChallenge.findOneAndUpdate({ _id: challenge._id, usedAt: null, attempts: { $lt: OTP_MAX_ATTEMPTS } }, { usedAt: now });
  if (!used) throw invalid();
}
