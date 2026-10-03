import * as oidc from 'openid-client';
import { sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Config } from '../config.js';
import type { Db } from '../db/client.js';
import { users } from '../db/schema.js';
import type { OidcProvider } from './oidc.js';
import {
  LOGIN_COOKIE,
  SESSION_COOKIE,
  consumeLoginSession,
  createSession,
  deleteSession,
  findSessionUser,
} from './sessions.js';

export type User = typeof users.$inferSelect;

declare module 'fastify' {
  interface FastifyRequest {
    user: User | null;
  }
}

const LOGIN_TTL_MS = 10 * 60 * 1000;
export const CSRF_HEADER = 'x-requested-with';

/** Only allow relative, same-origin paths as post-login targets. */
export function safeReturnTo(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '/';
  if (value.includes('\\') || value.startsWith('/auth/')) return '/';
  return value;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function errorPage(message: string, guestAccess = false) {
  return `<!doctype html><html lang="nb"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Innlogging feilet</title>
<style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem;color:#1e293b}a{color:#0f766e}</style></head>
<body><h1>Innlogging feilet</h1><p>${escapeHtml(message)}</p><p><a href="/auth/login">Prøv igjen</a></p>${
    guestAccess ? '<p>Er du ikke ansatt i organisasjonen? <a href="/#tilgang">Be om gjestetilgang</a></p>' : ''
  }</body></html>`;
}

export async function registerAuth(
  app: FastifyInstance,
  deps: { db: Db; config: Config; provider: OidcProvider | null },
) {
  const { db, config, provider } = deps;
  const ttlMs = config.SESSION_TTL_DAYS * 86_400_000;
  const guestAccess = config.GUEST_INVITE_DOMAINS.length > 0;
  const cookieBase = {
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: 'lax' as const,
    signed: true,
  };

  app.decorateRequest('user', null);

  const readCookie = (req: FastifyRequest, name: string) => {
    const raw = req.cookies[name];
    if (!raw) return null;
    const res = req.unsignCookie(raw);
    return res.valid ? res.value : null;
  };

  const startSession = async (reply: FastifyReply, userId: string, data: Record<string, unknown>) => {
    const token = await createSession(db, { userId, data, ttlMs });
    reply.setCookie(SESSION_COOKIE, token, { ...cookieBase, path: '/', maxAge: ttlMs / 1000 });
  };

  const upsertUser = async (u: { tenantId: string; oid: string; name: string; email: string }) => {
    const [row] = await db
      .insert(users)
      .values(u)
      .onConflictDoUpdate({
        target: [users.tenantId, users.oid],
        set: { name: u.name, email: u.email, lastLoginAt: sql`now()` },
      })
      .returning();
    return row!;
  };

  app.addHook('onRequest', async (req) => {
    const token = readCookie(req, SESSION_COOKIE);
    if (!token) return;
    const found = await findSessionUser(db, token);
    if (found) req.user = found.user;
  });

  app.get('/auth/login', async (req, reply) => {
    const query = req.query as Record<string, string | undefined>;
    const returnTo = safeReturnTo(query.returnTo);

    if (config.DEV_AUTH_BYPASS) {
      const id = (query.user ?? 'dev').replace(/[^a-z0-9._-]/gi, '').slice(0, 40) || 'dev';
      const user = await upsertUser({
        tenantId: 'dev',
        oid: id,
        name: `Utvikler ${id}`,
        email: `${id}@example.test`,
      });
      await startSession(reply, user.id, {});
      return reply.redirect(returnTo);
    }

    if (!provider) throw new Error('OIDC er ikke konfigurert');
    const codeVerifier = oidc.randomPKCECodeVerifier();
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    let url: URL;
    try {
      url = await provider.authorizationUrl({
        state,
        nonce,
        codeChallenge: await oidc.calculatePKCECodeChallenge(codeVerifier),
      });
    } catch (err) {
      req.log.error({ err }, 'OIDC discovery failed');
      return reply
        .code(502)
        .type('text/html; charset=utf-8')
        .send(errorPage('Kunne ikke kontakte Microsoft Entra ID. Sjekk tenant-ID og nettverk.'));
    }
    const token = await createSession(db, {
      userId: null,
      data: { state, nonce, codeVerifier, returnTo },
      ttlMs: LOGIN_TTL_MS,
    });
    reply.setCookie(LOGIN_COOKIE, token, {
      ...cookieBase,
      path: '/auth',
      maxAge: LOGIN_TTL_MS / 1000,
    });
    return reply.redirect(url.toString());
  });

  app.get('/auth/callback', async (req, reply) => {
    const query = req.query as Record<string, string | undefined>;
    const token = readCookie(req, LOGIN_COOKIE);
    reply.clearCookie(LOGIN_COOKIE, { path: '/auth' });
    reply.type('text/html; charset=utf-8');

    if (query.error) {
      req.log.warn({ error: query.error, description: query.error_description }, 'OIDC error');
      return reply.code(400).send(errorPage(query.error_description ?? query.error, guestAccess));
    }
    if (!provider || !token) {
      return reply.code(400).send(errorPage('Innloggingsforsøket er utløpt. Prøv på nytt.'));
    }
    const pending = await consumeLoginSession(db, token);
    if (!pending) {
      return reply.code(400).send(errorPage('Innloggingsforsøket er utløpt. Prøv på nytt.'));
    }
    const data = pending.data as {
      state: string;
      nonce: string;
      codeVerifier: string;
      returnTo: string;
    };

    let result;
    try {
      const currentUrl = new URL(req.url, config.PUBLIC_URL);
      result = await provider.exchange(currentUrl, data);
    } catch (err) {
      req.log.warn({ err }, 'OIDC code exchange failed');
      return reply.code(400).send(errorPage('Kunne ikke fullføre innloggingen.'));
    }

    const { claims, idToken } = result;
    const tid = typeof claims.tid === 'string' ? claims.tid : '';
    const oid = typeof claims.oid === 'string' ? claims.oid : '';
    if (!oid || tid.toLowerCase() !== config.ENTRA_TENANT_ID.toLowerCase()) {
      return reply.code(403).send(errorPage('Brukeren tilhører ikke en tillatt organisasjon.', guestAccess));
    }
    const email =
      (typeof claims.email === 'string' && claims.email) ||
      (typeof claims.preferred_username === 'string' && claims.preferred_username) ||
      '';
    const name = (typeof claims.name === 'string' && claims.name) || email;
    const user = await upsertUser({ tenantId: tid, oid, name, email });
    await startSession(reply, user.id, idToken ? { idToken } : {});
    return reply.redirect(safeReturnTo(data.returnTo));
  });

  app.get('/auth/logout', async (req, reply) => {
    const token = readCookie(req, SESSION_COOKIE);
    const session = token ? await deleteSession(db, token) : undefined;
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    const home = new URL('/', config.PUBLIC_URL).toString();
    if (!provider || config.DEV_AUTH_BYPASS) return reply.redirect('/');
    try {
      const idToken = session?.data.idToken;
      const url = await provider.endSessionUrl({
        postLogoutRedirectUri: home,
        idTokenHint: typeof idToken === 'string' ? idToken : undefined,
      });
      return reply.redirect(url.toString());
    } catch (err) {
      req.log.warn({ err }, 'Could not build end-session URL');
      return reply.redirect('/');
    }
  });

  /** Guard for API routes: requires a session, and a custom header on mutations (CSRF). */
  return async function requireUser(req: FastifyRequest, reply: FastifyReply) {
    if (!req.user) return reply.code(401).send({ message: 'Ikke innlogget' });
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.headers[CSRF_HEADER] !== 'mytime') {
      return reply.code(403).send({ message: 'Mangler CSRF-header' });
    }
  };
}
