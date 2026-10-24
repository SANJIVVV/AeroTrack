import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');

/** Uniform 6-digit code from a CSPRNG (no modulo bias). */
export const randomOtp = () => String(randomInt(0, 1_000_000)).padStart(6, '0');
export const hmac = (secret, value) => createHmac('sha256', secret).update(value).digest('hex');
export function safeEqualHex(a, b) {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && timingSafeEqual(x, y);
}
