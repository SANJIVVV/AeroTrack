import { Notification, User } from '../models/index.js';
import { logger } from '../utils/logger.js';

/**
 * Creates an in-app notification and, if the user opted in and email is
 * configured, emails it. Returns null when the dedupe key was already used.
 * Delivery outcomes are recorded honestly on the notification.
 */
export async function notify(ctx, input) {
  let doc;
  try {
    doc = await Notification.create({
      user: input.userId,
      kind: input.kind,
      title: input.title,
      body: input.body,
      link: input.link ?? null,
      dedupeKey: input.dedupeKey,
      isDemo: input.isDemo ?? false,
    });
  } catch (err) {
    if (err.code === 11000) return null; // already notified
    throw err;
  }

  const user = await User.findById(input.userId);
  // Demo users have non-routable addresses; never email them.
  if (!user || user.isDemo || input.isDemo) {
    doc.email = { status: 'skipped', error: null, attemptedAt: null };
  } else if (!user.preferences?.emailNotifications) {
    doc.email = { status: 'skipped', error: 'User opted out of email', attemptedAt: null };
  } else {
    const link = input.link ? `${ctx.env.CLIENT_URL}${input.link}` : ctx.env.CLIENT_URL;
    const result = await ctx.email.send({ to: user.email, subject: `AeroTrack Pro: ${input.title}`, text: `${input.body}\n\n${link}` });
    doc.email = {
      status: result.status,
      error: result.status === 'failed' ? result.error : null,
      attemptedAt: ctx.now(),
    };
    if (result.status === 'failed') logger.warn({ kind: input.kind }, 'Notification email failed');
  }
  await doc.save();
  return doc;
}
