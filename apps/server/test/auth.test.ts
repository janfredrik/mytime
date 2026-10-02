import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { OidcProvider } from '../src/auth/oidc.js';
import { loadConfig } from '../src/config.js';
import { createDb, runMigrations } from '../src/db/client.js';

const DATABASE_URL = process.env.TEST_DATABASE_URL;
const TENANT = '11111111-1111-1111-1111-111111111111';

describe.skipIf(!DATABASE_URL)('Entra login (BFF)', () => {
  let app: FastifyInstance;
  let close: () => Promise<void>;
  let db: ReturnType<typeof createDb>['db'];
  let claims: Record<string, unknown> = {};
  let lastChecks: { state: string; nonce: string; codeVerifier: string } | undefined;

  const provider: OidcProvider = {
    async authorizationUrl({ state }) {
      return new URL(`https://login.example/authorize?state=${state}`);
    },
    async exchange(currentUrl, checks) {
      lastChecks = checks;
      if (currentUrl.searchParams.get('state') !== checks.state) throw new Error('state mismatch');
      return { claims: claims as never, idToken: 'id-token' };
    },
    async endSessionUrl({ postLogoutRedirectUri }) {
      return new URL(`https://login.example/logout?post_logout_redirect_uri=${postLogoutRedirectUri}`);
    },
  };

  beforeAll(async () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL,
      PUBLIC_URL: 'https://mytime.x99.no',
      SESSION_SECRET: 'test-secret-test-secret-test-secret!',
      ENTRA_TENANT_ID: TENANT,
      ENTRA_CLIENT_ID: 'client',
      ENTRA_CLIENT_SECRET: 'secret',
    });
    ({ db, close } = createDb(DATABASE_URL!));
    await runMigrations(db);
    app = await buildApp({ config, db, provider, logger: false });
  });

  beforeEach(async () => {
    await db.execute(sql`truncate users, sessions cascade`);
  });

  afterAll(async () => {
    await app?.close();
    await close?.();
  });

  async function startLogin(returnTo = '/?uke=2026-40') {
    const res = await app.inject({ method: 'GET', url: `/auth/login?returnTo=${encodeURIComponent(returnTo)}` });
    expect(res.statusCode).toBe(302);
    const state = new URL(res.headers.location as string).searchParams.get('state')!;
    const cookie = res.cookies.find((c) => c.name === 'mytime_login')!;
    expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax', path: '/auth' });
    return { state, cookie: `mytime_login=${cookie.value}` };
  }

  it('signs in a user from the configured tenant', async () => {
    claims = { tid: TENANT, oid: 'user-1', name: 'Kari Nordmann', preferred_username: 'kari@x99.no' };
    const { state, cookie } = await startLogin();
    const res = await app.inject({
      method: 'GET',
      url: `/auth/callback?code=abc&state=${state}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/?uke=2026-40');
    expect(lastChecks?.codeVerifier).toBeTruthy();

    const session = res.cookies.find((c) => c.name === 'mytime_session')!;
    const me = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { cookie: `mytime_session=${session.value}` },
    });
    expect(me.json()).toMatchObject({ name: 'Kari Nordmann', email: 'kari@x99.no' });

    // The login attempt is single-use.
    const replay = await app.inject({
      method: 'GET',
      url: `/auth/callback?code=abc&state=${state}`,
      headers: { cookie },
    });
    expect(replay.statusCode).toBe(400);

    const logout = await app.inject({
      method: 'GET',
      url: '/auth/logout',
      headers: { cookie: `mytime_session=${session.value}` },
    });
    expect(logout.headers.location).toContain('post_logout_redirect_uri=https://mytime.x99.no/');
  });

  it('rejects users from other tenants', async () => {
    claims = { tid: '22222222-2222-2222-2222-222222222222', oid: 'user-2', name: 'Ekstern' };
    const { state, cookie } = await startLogin();
    const res = await app.inject({
      method: 'GET',
      url: `/auth/callback?code=abc&state=${state}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(403);
    expect(res.cookies.find((c) => c.name === 'mytime_session')).toBeUndefined();
  });

  it('rejects a callback without the login cookie', async () => {
    const { state } = await startLogin();
    const res = await app.inject({ method: 'GET', url: `/auth/callback?code=abc&state=${state}` });
    expect(res.statusCode).toBe(400);
  });

  it('shows Entra errors to the user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/auth/callback?error=access_denied&error_description=<script>x</script>',
    });
    expect(res.statusCode).toBe(400);
    expect(res.body).not.toContain('<script>');
  });
});
