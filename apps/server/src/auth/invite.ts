import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Config } from '../config.js';
import { CSRF_HEADER } from './plugin.js';

/**
 * Self-service guest invitations: people from an approved domain who are not yet in the tenant can add
 * themselves as B2B guests, then sign in as usual. Uses Microsoft Graph with application permissions
 * (`User.Invite.All` and `User.Read.All`) through the app registration's client credentials.
 */

export type InviteResult =
  /** The account exists (member, or a guest from earlier) and can sign in now. */
  | 'ready'
  /** Invited just now, and the new guest account is visible in the directory. */
  | 'invited'
  /** Invited just now, but the directory has not caught up yet; sign-in works in a minute or so. */
  | 'pending';

export interface GuestInviter {
  invite(email: string): Promise<InviteResult>;
}

const GRAPH = 'https://graph.microsoft.com/v1.0';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createGraphInviter(
  config: Config,
  opts: { pollMs?: number; waitMs?: number; fetch?: typeof fetch } = {},
): GuestInviter {
  const pollMs = opts.pollMs ?? 2000;
  const waitMs = opts.waitMs ?? 30_000;
  const http = opts.fetch ?? fetch;
  let cached: { token: string; expires: number } | undefined;

  async function token() {
    if (cached && cached.expires > Date.now() + 60_000) return cached.token;
    const res = await http(`https://login.microsoftonline.com/${config.ENTRA_TENANT_ID}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: config.ENTRA_CLIENT_ID,
        client_secret: config.ENTRA_CLIENT_SECRET,
        scope: 'https://graph.microsoft.com/.default',
      }),
    });
    if (!res.ok) throw new Error(`Token request failed (${res.status}): ${await res.text()}`);
    const data = (await res.json()) as { access_token: string; expires_in: number };
    cached = { token: data.access_token, expires: Date.now() + data.expires_in * 1000 };
    return cached.token;
  }

  async function graph(path: string, init: RequestInit = {}) {
    return http(`${GRAPH}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${await token()}`, 'content-type': 'application/json', ...init.headers },
    });
  }

  async function findUser(email: string) {
    const e = email.replace(/'/g, "''");
    const filter = encodeURIComponent(`mail eq '${e}' or userPrincipalName eq '${e}'`);
    const res = await graph(`/users?$filter=${filter}&$select=id&$top=1`);
    if (!res.ok) throw new Error(`User lookup failed (${res.status}): ${await res.text()}`);
    const data = (await res.json()) as { value: { id: string }[] };
    return data.value[0]?.id ?? null;
  }

  return {
    async invite(email) {
      if (await findUser(email)) return 'ready';

      const res = await graph('/invitations', {
        method: 'POST',
        body: JSON.stringify({
          invitedUserEmailAddress: email,
          inviteRedirectUrl: config.PUBLIC_URL,
          // The person is already on our sign-in page; they redeem the invitation by signing in.
          sendInvitationMessage: false,
        }),
      });
      if (!res.ok) throw new Error(`Invitation failed (${res.status}): ${await res.text()}`);
      const { invitedUser } = (await res.json()) as { invitedUser: { id: string } };

      // The invitation returns before the guest is replicated everywhere; wait until Graph sees it.
      const deadline = Date.now() + waitMs;
      while (Date.now() < deadline) {
        const check = await graph(`/users/${invitedUser.id}?$select=id`);
        if (check.ok) return 'invited';
        await sleep(pollMs);
      }
      return 'pending';
    },
  };
}

/** For DEV_AUTH_BYPASS: pretends to invite, slowly enough to see the waiting state. */
export const fakeInviter: GuestInviter = {
  async invite(email) {
    await sleep(2500);
    return email.startsWith('finnes') ? 'ready' : 'invited';
  },
};

const bodySchema = z.object({ email: z.string().trim().toLowerCase().pipe(z.email()) });

const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;

export async function registerInvite(
  app: FastifyInstance,
  deps: { config: Config; inviter: GuestInviter | null },
) {
  const { config, inviter } = deps;
  const domains = inviter ? config.GUEST_INVITE_DOMAINS : [];
  const attempts = new Map<string, number[]>();

  /** Rate limit per client IP; the endpoint is public and every call reaches Graph. */
  const allow = (ip: string) => {
    const now = Date.now();
    const recent = (attempts.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
    if (recent.length >= MAX_PER_WINDOW) return false;
    recent.push(now);
    attempts.set(ip, recent);
    if (attempts.size > 10_000) attempts.clear();
    return true;
  };

  app.get('/auth/invite', async () => ({ enabled: domains.length > 0 }));

  app.post('/auth/invite', async (req, reply) => {
    if (!inviter || !domains.length) return reply.code(404).send({ message: 'Ikke tilgjengelig' });
    if (req.headers[CSRF_HEADER] !== 'mytime') {
      return reply.code(403).send({ message: 'Mangler CSRF-header' });
    }
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Skriv inn en gyldig e-postadresse' });
    }
    const { email } = parsed.data;
    const domain = email.split('@')[1]!;
    if (!domains.includes(domain)) {
      return reply.code(400).send({ message: 'Ugyldig domene' });
    }
    if (!allow(req.ip)) {
      return reply.code(429).send({ message: 'For mange forsøk. Vent noen minutter og prøv igjen' });
    }
    try {
      const status = await inviter.invite(email);
      req.log.info({ domain, status }, 'Guest invite');
      return { status };
    } catch (err) {
      req.log.error({ err }, 'Guest invite failed');
      return reply.code(502).send({ message: 'Fikk ikke lagt deg til akkurat nå. Prøv igjen om litt' });
    }
  });
}
