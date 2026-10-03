import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0', ''])
  .optional()
  .transform((v) => v === 'true' || v === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.string().default('info'),
  PUBLIC_URL: z.url().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1).default('postgres://mytime:mytime@localhost:5432/mytime'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET må være minst 32 tegn'),
  SESSION_TTL_DAYS: z.coerce.number().positive().default(14),
  ENTRA_TENANT_ID: z.string().default(''),
  ENTRA_CLIENT_ID: z.string().default(''),
  ENTRA_CLIENT_SECRET: z.string().default(''),
  /** Comma-separated email domains that may invite themselves as guests. Empty turns it off. */
  GUEST_INVITE_DOMAINS: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
        .filter(Boolean),
    ),
  DEV_AUTH_BYPASS: bool,
  WEB_DIST: z.string().optional(),
});

export type Config = z.infer<typeof envSchema> & { secureCookies: boolean };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Ugyldig konfigurasjon:\n${issues}`);
  }
  const config = parsed.data;
  if (config.DEV_AUTH_BYPASS && config.NODE_ENV === 'production') {
    throw new Error('DEV_AUTH_BYPASS kan ikke brukes når NODE_ENV=production');
  }
  if (!config.DEV_AUTH_BYPASS) {
    const missing = (['ENTRA_TENANT_ID', 'ENTRA_CLIENT_ID', 'ENTRA_CLIENT_SECRET'] as const).filter(
      (k) => !config[k],
    );
    if (missing.length) throw new Error(`Mangler miljøvariabler: ${missing.join(', ')}`);
  }
  return { ...config, secureCookies: config.PUBLIC_URL.startsWith('https://') };
}
