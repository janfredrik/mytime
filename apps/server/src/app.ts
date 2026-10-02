import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerAuth } from './auth/plugin.js';
import { type OidcProvider, createEntraProvider } from './auth/oidc.js';
import type { Config } from './config.js';
import type { Db } from './db/client.js';
import { HttpError } from './errors.js';
import { registerApi } from './routes/api.js';
import { sql } from 'drizzle-orm';

export interface AppOptions {
  config: Config;
  db: Db;
  provider?: OidcProvider | null;
  today?: () => string;
  logger?: boolean;
}

function findWebDist(configured?: string): string | null {
  if (configured) return existsSync(configured) ? resolve(configured) : null;
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 5; i++) {
    const candidate = join(dir, 'apps', 'web', 'dist');
    if (existsSync(join(candidate, 'index.html'))) return candidate;
    const sibling = join(dir, 'web', 'dist');
    if (existsSync(join(sibling, 'index.html'))) return sibling;
    dir = dirname(dir);
  }
  return null;
}

export async function buildApp(opts: AppOptions) {
  const { config, db } = opts;
  const app = Fastify({
    trustProxy: true,
    logger: opts.logger === false ? false : { level: config.LOG_LEVEL },
    bodyLimit: 2 * 1024 * 1024,
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'"],
        formAction: ["'self'", 'https://login.microsoftonline.com'],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: config.secureCookies ? [] : null,
      },
    },
    hsts: config.secureCookies,
  });
  await app.register(cookie, { secret: config.SESSION_SECRET });
  await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) return reply.code(err.statusCode).send({ message: err.message });
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) {
      return reply.code(status).send({ message: (err as Error).message });
    }
    req.log.error({ err }, 'Unhandled error');
    return reply.code(500).send({ message: 'Intern feil' });
  });

  app.get('/healthz', async (_req, reply) => {
    try {
      await db.execute(sql`select 1`);
      return { ok: true };
    } catch {
      return reply.code(503).send({ ok: false });
    }
  });

  const provider =
    opts.provider !== undefined
      ? opts.provider
      : config.DEV_AUTH_BYPASS
        ? null
        : createEntraProvider(config);
  const requireUser = await registerAuth(app, { db, config, provider });
  await registerApi(app, { db, requireUser, today: opts.today });

  const webDist = findWebDist(config.WEB_DIST);
  if (webDist) {
    await app.register(fastifyStatic, { root: webDist, wildcard: false, index: false });
    app.get('/assets/*', async (req, reply) => {
      const path = (req.params as { '*': string })['*'];
      return reply.header('cache-control', 'public, max-age=31536000, immutable').sendFile(`assets/${path}`);
    });
  }

  app.setNotFoundHandler(async (req, reply) => {
    const isPage =
      req.method === 'GET' && !req.url.startsWith('/api/') && !req.url.startsWith('/auth/');
    if (isPage && webDist) {
      return reply.header('cache-control', 'no-cache').sendFile('index.html');
    }
    return reply.code(404).send({ message: 'Ikke funnet' });
  });

  return app;
}
