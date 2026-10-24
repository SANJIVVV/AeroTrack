import { z } from 'zod';

/**
 * Environment validation. Values are never logged; only the names of missing
 * or invalid variables are reported.
 */
const bool = z
  .enum(['true', 'false', '1', '0'])
  .optional()
  .transform((v) => v === 'true' || v === '1');

/** Like `bool`, but true when the variable is not set. */
const boolDefaultTrue = z
  .enum(['true', 'false', '1', '0'])
  .optional()
  .transform((v) => v === undefined || v === 'true' || v === '1');

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    MONGODB_URI: z
      .string({ error: 'MONGODB_URI is required' })
      .min(1, 'MONGODB_URI is required')
      .refine((v) => v.startsWith('mongodb://') || v.startsWith('mongodb+srv://'), 'MONGODB_URI must start with mongodb:// or mongodb+srv://')
      .refine((v) => !v.includes('<') && !v.includes('>'), 'MONGODB_URI still contains a <placeholder>; insert your URL-encoded password locally'),
    MONGODB_DB_NAME: z.string().default('aerotrack_pro'),
    CLIENT_URL: z.url().default('http://localhost:4000'),
    API_BASE_URL: z.url().optional(),
    CORS_ORIGINS: z.string().optional(),
    SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
    SESSION_TTL_HOURS: z.coerce
      .number()
      .positive()
      .default(24 * 7),
    COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
    TRUST_PROXY: bool,
    SERVE_CLIENT: boolDefaultTrue,

    EMAIL_PROVIDER: z.enum(['smtp', 'dev', 'none']).default('dev'),
    EMAIL_FROM: z.string().optional(),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().optional(),
    SMTP_SECURE: bool,
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),

    DELAY_MODEL_PATH: z.string().optional(),
    ANOMALY_SWEEP_INTERVAL_MIN: z.coerce.number().nonnegative().default(5),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  })
  .superRefine((e, ctx) => {
    if (e.EMAIL_PROVIDER === 'smtp' && !e.EMAIL_FROM) ctx.addIssue({ code: 'custom', path: ['EMAIL_FROM'], message: 'required when sending real email' });
    if (e.EMAIL_PROVIDER === 'smtp' && !e.SMTP_HOST) ctx.addIssue({ code: 'custom', path: ['SMTP_HOST'], message: 'required when EMAIL_PROVIDER=smtp' });
    if (e.NODE_ENV === 'production' && e.EMAIL_PROVIDER === 'dev') ctx.addIssue({ code: 'custom', path: ['EMAIL_PROVIDER'], message: 'dev email mode is not allowed in production; use smtp or none' });
    if (e.COOKIE_SAMESITE === 'none' && e.NODE_ENV !== 'production') ctx.addIssue({ code: 'custom', path: ['COOKIE_SAMESITE'], message: 'none requires HTTPS; only use it in production' });
  });

export class EnvError extends Error {}

export function loadEnv(source = process.env) {
  // Treat empty strings as unset so a blank line in .env behaves like a missing one.
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== ''));
  // Accept the common alternative names DB_NAME and JWT_SECRET when the primary names are unset.
  cleaned.MONGODB_DB_NAME ??= cleaned.DB_NAME;
  cleaned.SESSION_SECRET ??= cleaned.JWT_SECRET;
  const parsed = schema.safeParse(cleaned);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.') || '(env)'}: ${i.message}`);
    throw new EnvError(`Invalid environment configuration:\n${lines.join('\n')}\nSee .env.example and README.md.`);
  }
  return parsed.data;
}

export function corsOrigins(env) {
  const extra =
    env.CORS_ORIGINS?.split(',')
      .map((s) => s.trim())
      .filter(Boolean) ?? [];
  return [...new Set([new URL(env.CLIENT_URL).origin, ...extra])];
}

/** Hide credentials in a Mongo URI so it can be mentioned in logs. */
export function redactMongoUri(uri) {
  try {
    const u = new URL(uri);
    return `${u.protocol}//${u.username ? '***:***@' : ''}${u.host}${u.pathname}`;
  } catch {
    return '(unparseable MongoDB URI)';
  }
}
