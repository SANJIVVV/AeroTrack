import { z } from 'zod';
import { badRequest } from '../utils/errors.js';

export function parse(schema, data) {
  const result = schema.safeParse(data ?? {});
  if (!result.success) {
    throw badRequest(
      'Some fields are invalid.',
      result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    );
  }
  return result.data;
}

export const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');
export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export const demoScope = z.enum(['operational', 'demo', 'all']).default('operational');
export const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
