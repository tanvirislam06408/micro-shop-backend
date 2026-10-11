import { z } from 'zod/v4';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(5000),
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required')
    .refine(
      (val) => val.startsWith('postgresql://') || val.startsWith('postgres://'),
      'DATABASE_URL must be a valid PostgreSQL connection string (postgresql:// or postgres://)',
    ),
  FRONTEND_URL: z.url('Invalid FRONTEND_URL').default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validates an environment object against the schema.
 * Throws a descriptive error without leaking secret values if validation fails.
 */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration — ${issues}`);
  }

  return result.data;
}

function initEnv(): Env {
  try {
    return parseEnv(process.env);
  } catch (error) {
    console.error(
      JSON.stringify({
        level: 'error',
        message: error instanceof Error ? error.message : 'Environment validation failed',
        timestamp: new Date().toISOString(),
      }),
    );
    process.exit(1);
  }
}

export const env = initEnv();
