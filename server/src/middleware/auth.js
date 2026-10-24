import { Session, User } from '../models/index.js';
import { sha256, randomToken } from '../utils/crypto.js';
import { forbidden, unauthorized } from '../utils/errors.js';

export const SESSION_COOKIE = 'aerotrack_session';

export function cookieOptions(env) {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: env.COOKIE_SAMESITE,
    path: '/',
    maxAge: env.SESSION_TTL_HOURS * 3600 * 1000,
  };
}

export async function startSession(env, req, res, user) {
  const token = randomToken(32);
  await Session.create({
    user: user._id,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + env.SESSION_TTL_HOURS * 3600 * 1000),
    userAgent: req.get('user-agent')?.slice(0, 300),
  });
  res.cookie(SESSION_COOKIE, token, cookieOptions(env));
}

/** Attaches req.user when a valid session cookie is present. Never throws for anonymous requests. */
export const loadSession = async (req, _res, next) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) return next();
  const session = await Session.findOne({ tokenHash: sha256(token), expiresAt: { $gt: new Date() } });
  if (!session) return next();
  const user = await User.findById(session.user);
  if (!user || user.disabled) return next();
  req.user = user;
  req.sessionId = String(session._id);
  next();
};

export const requireAuth = (req, _res, next) => {
  if (!req.user) throw unauthorized();
  next();
};

export const requireVerified = (req, _res, next) => {
  if (!req.user) throw unauthorized();
  if (!req.user.emailVerified) throw forbidden('Please verify your email address first.');
  next();
};

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) throw unauthorized();
    if (!roles.includes(req.user.role)) throw forbidden();
    next();
  };
}

export const isStaff = (u) => u?.role === 'staff' || u?.role === 'admin';
