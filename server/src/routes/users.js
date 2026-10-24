import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

import { Session, User } from '../models/index.js';
import { requireAuth } from '../middleware/auth.js';
import { parse } from '../validators/common.js';
import { toPublicUser } from '../services/serializers.js';
import { AppError } from '../utils/errors.js';
import { audit } from '../services/audit.js';

export function userRoutes(_ctx) {
  const r = Router();
  r.use(requireAuth);

  r.patch('/me', async (req, res) => {
    const body = parse(
      z.object({
        name: z.string().trim().min(2).max(100).optional(),
        preferences: z.object({ emailNotifications: z.boolean().optional(), browserNotifications: z.boolean().optional() }).optional(),
        tutorialCompleted: z.boolean().optional(),
      }),
      req.body,
    );
    const u = req.user;
    if (body.name) u.name = body.name;
    if (body.preferences) {
      u.preferences = {
        emailNotifications: body.preferences.emailNotifications ?? u.preferences?.emailNotifications ?? true,
        browserNotifications: body.preferences.browserNotifications ?? u.preferences?.browserNotifications ?? false,
      };
    }
    if (body.tutorialCompleted !== undefined) u.tutorialCompleted = body.tutorialCompleted;
    await u.save();
    res.json({ user: toPublicUser(u) });
  });

  r.post('/me/password', async (req, res) => {
    const body = parse(
      z.object({
        currentPassword: z.string().min(1).max(200),
        newPassword: z
          .string()
          .min(10)
          .refine((p) => Buffer.byteLength(p) <= 72 && /[a-zA-Z]/.test(p) && /\d/.test(p), 'Use 10+ characters with letters and a number'),
      }),
      req.body,
    );
    const u = await User.findById(req.user._id).select('+passwordHash');
    if (!u || !(await bcrypt.compare(body.currentPassword, u.passwordHash))) throw new AppError(400, 'INVALID_CREDENTIALS', 'Current password is incorrect.');
    u.passwordHash = await bcrypt.hash(body.newPassword, 12);
    await u.save();
    // Keep this session, end all others.
    await Session.deleteMany({ user: u._id, _id: { $ne: req.sessionId } });
    await audit(u, 'user.password_changed', { type: 'user', id: String(u._id) });
    res.json({ message: 'Password changed. Other sessions were signed out.' });
  });

  return r;
}
