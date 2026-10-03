import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { type GuestInviter, createGraphInviter, registerInvite } from '../src/auth/invite.js';
import { loadConfig } from '../src/config.js';

const config = loadConfig({
  NODE_ENV: 'test',
  PUBLIC_URL: 'https://mytime.x99.no',
  SESSION_SECRET: 'test-secret-test-secret-test-secret!',
  ENTRA_TENANT_ID: 'tenant',
  ENTRA_CLIENT_ID: 'client',
  ENTRA_CLIENT_SECRET: 'secret',
  GUEST_INVITE_DOMAINS: '@Partner.no, firma.no',
});

async function appWith(inviter: GuestInviter | null) {
  const app = Fastify();
  await registerInvite(app, { config, inviter });
  return app;
}

const post = (app: Awaited<ReturnType<typeof appWith>>, email: string, csrf = true) =>
  app.inject({
    method: 'POST',
    url: '/auth/invite',
    headers: csrf ? { 'x-requested-with': 'mytime' } : {},
    payload: { email },
  });

describe('guest invitations', () => {
  it('parses the allowed domains', () => {
    expect(config.GUEST_INVITE_DOMAINS).toEqual(['partner.no', 'firma.no']);
  });

  it('says whether inviting is on, without revealing the domains', async () => {
    const on = await appWith({ invite: async () => 'invited' });
    expect((await on.inject({ url: '/auth/invite' })).json()).toEqual({ enabled: true });
    const off = await appWith(null);
    expect((await off.inject({ url: '/auth/invite' })).json()).toEqual({ enabled: false });
    expect((await post(off, 'kari@partner.no')).statusCode).toBe(404);
  });

  it('invites addresses on an allowed domain', async () => {
    const invited: string[] = [];
    const app = await appWith({ invite: async (e) => (invited.push(e), 'invited') });
    const res = await post(app, ' Kari@Partner.no ');
    expect(res.json()).toEqual({ status: 'invited' });
    expect(invited).toEqual(['kari@partner.no']);
  });

  it('refuses other domains, bad input and missing CSRF header', async () => {
    const app = await appWith({ invite: async () => 'invited' });
    const other = await post(app, 'kari@gmail.com');
    expect(other.statusCode).toBe(400);
    expect(other.json().message).toBe('Ugyldig domene');
    expect((await post(app, 'ikke-en-adresse')).statusCode).toBe(400);
    expect((await post(app, 'kari@partner.no', false)).statusCode).toBe(403);
  });

  it('rate limits per client', async () => {
    const app = await appWith({ invite: async () => 'ready' });
    for (let i = 0; i < 5; i++) expect((await post(app, `p${i}@firma.no`)).statusCode).toBe(200);
    expect((await post(app, 'p6@firma.no')).statusCode).toBe(429);
  });

  it('reports Graph failures without leaking details', async () => {
    const app = await appWith({
      invite: async () => {
        throw new Error('secret detail');
      },
    });
    const res = await post(app, 'kari@partner.no');
    expect(res.statusCode).toBe(502);
    expect(res.body).not.toContain('secret');
  });
});

describe('Graph inviter', () => {
  function fakeGraph(opts: { existing?: boolean; visibleAfter?: number }) {
    const calls: string[] = [];
    let lookups = 0;
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    const fetch = (async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url.includes('/oauth2/v2.0/token')) return json({ access_token: 't', expires_in: 3600 });
      if (url.includes('/users?')) return json({ value: opts.existing ? [{ id: 'u1' }] : [] });
      if (url.endsWith('/invitations')) return json({ invitedUser: { id: 'g1' } }, 201);
      if (url.includes('/users/g1')) {
        return ++lookups > (opts.visibleAfter ?? 0) ? json({ id: 'g1' }) : json({}, 404);
      }
      return json({}, 500);
    }) as typeof globalThis.fetch;
    return { fetch, calls };
  }

  it('does not invite people who already have an account', async () => {
    const g = fakeGraph({ existing: true });
    const inviter = createGraphInviter(config, { fetch: g.fetch });
    expect(await inviter.invite("o'neil@partner.no")).toBe('ready');
    expect(g.calls.some((c) => c.includes('/invitations'))).toBe(false);
    expect(decodeURIComponent(g.calls[1]!)).toContain("mail eq 'o''neil@partner.no'");
  });

  it('invites, then waits until the guest shows up', async () => {
    const g = fakeGraph({ visibleAfter: 2 });
    const inviter = createGraphInviter(config, { fetch: g.fetch, pollMs: 1 });
    expect(await inviter.invite('kari@partner.no')).toBe('invited');
    expect(g.calls.filter((c) => c.includes('/users/g1'))).toHaveLength(3);
    expect(g.calls.filter((c) => c.includes('/token'))).toHaveLength(1);
  });

  it('gives up waiting after a while', async () => {
    const g = fakeGraph({ visibleAfter: Infinity });
    const inviter = createGraphInviter(config, { fetch: g.fetch, pollMs: 1, waitMs: 20 });
    expect(await inviter.invite('kari@partner.no')).toBe('pending');
  });
});
