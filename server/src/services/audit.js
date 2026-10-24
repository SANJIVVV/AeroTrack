import { AuditEvent } from '../models/index.js';
import { logger } from '../utils/logger.js';

export async function audit(actor, action, target, meta = {}, isDemo = false) {
  try {
    await AuditEvent.create({ actor: actor?._id ?? null, actorRole: actor?.role ?? null, action, targetType: target?.type ?? null, targetId: target?.id ?? null, meta, isDemo });
  } catch (err) {
    // Auditing must never break the request, but failures are visible in logs.
    logger.error({ action, err: err.message }, 'Failed to write audit event');
  }
}
