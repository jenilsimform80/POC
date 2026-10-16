import { z } from 'zod';

const envSchema = z.object({
  // Fail-safe default: if NODE_ENV is forgotten the app behaves as production (Secure __Host- cookie,
  // error logging on), never as a weaker development mode. Local dev sets NODE_ENV=development in .env.
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'must be a PostgreSQL connection URL'),
  // Number of reverse-proxy hops in front of the app whose X-Forwarded-For is trusted for the client
  // IP (login throttling). 0 = no proxy: the header is ignored. Never "true": that would trust the
  // client-controlled left-most value and let an attacker dodge the limiter.
  TRUST_PROXY: z
    .string()
    .regex(/^\d+$/, 'must be a whole number of proxy hops (0, 1, 2...), not "true"')
    .default('0')
    .transform(Number),
  SESSION_TTL_HOURS: z.coerce
    .number()
    .positive()
    .max(24 * 30)
    .default(8),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),
  // Coarse cap on ALL login attempts per IP (successful ones cost an argon2 hash and a session row).
  LOGIN_ATTEMPT_LIMIT_MAX: z.coerce.number().int().min(1).default(100),
  LOGIN_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().positive().default(15),
  // Swagger UI at /api-docs. Unset = on outside production, off in production (a public API map is
  // reconnaissance help). Set to "true"/"false" to override.
  API_DOCS_ENABLED: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
  FRONTEND_URL: z
    .string()
    .default('http://localhost:5173')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
});

export type Env = z.infer<typeof envSchema>;

/** Parses and validates environment variables; throws a readable error if invalid. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${problems}`);
  }
  return result.data;
}
