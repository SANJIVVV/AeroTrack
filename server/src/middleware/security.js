import rateLimit from 'express-rate-limit';
import { AppError } from '../utils/errors.js';

/**
 * CSRF defence for cookie sessions: state-changing requests must carry a
 * custom header. Browsers cannot send it cross-origin without a CORS
 * preflight, and CORS only allows our own client origins.
 */
export const requireCsrfHeader = (req, _res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('x-requested-with') !== 'aerotrack') {
    throw new AppError(403, 'CSRF', 'Missing request header.');
  }
  next();
};

const limitHandler = {
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait a moment and try again.' } });
  },
};

export function createLimiters(disabled) {
  const skip = () => disabled;
  return {
    api: rateLimit({ ...limitHandler, windowMs: 60_000, limit: 300, skip }),
    auth: rateLimit({ ...limitHandler, windowMs: 15 * 60_000, limit: 20, skip }),
    email: rateLimit({ ...limitHandler, windowMs: 60 * 60_000, limit: 10, skip }),
    scan: rateLimit({ ...limitHandler, windowMs: 60_000, limit: 120, skip }),
  };
}
