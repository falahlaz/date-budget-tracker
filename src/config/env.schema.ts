import { z } from 'zod';

/**
 * Environment contract (PRD section 10.5).
 *
 * The app MUST fail to boot when anything here is missing or invalid -- a half-configured
 * server that silently falls back to defaults is worse than one that refuses to start.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  APP_TZ: z.string().min(1).default('Asia/Jakarta'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters (use: openssl rand -hex 32)'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  REFRESH_TTL_DAYS: z.coerce.number().int().min(1).default(30),

  /**
   * Whether the refresh cookie carries the Secure flag. Defaults to on in production.
   *
   * Set this false only when the app is genuinely served over plain HTTP (a LAN deploy with
   * no TLS terminator) -- a Secure cookie sent over http:// is silently discarded by the
   * browser, which leaves login working but every reload bouncing back to the login screen.
   */
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),

  STORAGE_DRIVER: z.enum(['local']).default('local'),
  STORAGE_ROOT: z.string().min(1).default('./storage'),
  MAX_UPLOAD_MB: z.coerce.number().int().min(1).default(10),
  MAX_RECEIPTS_PER_EXPENSE: z.coerce.number().int().min(1).default(5),

  // Optional bootstrap user; only applied when the users table is empty.
  SEED_USER_EMAIL: z.string().email().or(z.literal('')).optional(),
  SEED_USER_PASSWORD: z.string().optional(),
  SEED_USER_NAME: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validates `process.env` and returns the typed config, or throws with every problem
 * listed at once so a misconfigured deploy needs one restart, not five.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);

  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }

  return result.data;
}
