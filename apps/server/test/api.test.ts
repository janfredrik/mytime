import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createDb, runMigrations } from '../src/db/client.js';

const DATABASE_URL = process.env.TEST_DATABASE_URL;
const WEEK = '2026-09-28';
const fixture = readFileSync(new URL('./fixtures/week40-sample.xlsx', import.meta.url));

describe.skipIf(!DATABASE_URL)('API', () => {
  let app: FastifyInstance;
  let close: () => Promise<void>;
  let db: ReturnType<typeof createDb>['db'];

  beforeAll(async () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL,
      SESSION_SECRET: 'test-secret-test-secret-test-secret!',
      DEV_AUTH_BYPASS: 'true',
    });
    ({ db, close } = createDb(DATABASE_URL!));
    await runMigrations(db);
    app = await buildApp({ config, db, logger: false, today: () => '2026-10-02' });
  });

  beforeEach(async () => {
    await db.execute(sql`truncate users, sessions cascade`);
  });

  afterAll(async () => {
    await app?.close();
    await close?.();
  });

  async function login(user: string) {
    const res = await app.inject({ method: 'GET', url: `/auth/login?user=${user}` });
    expect(res.statusCode).toBe(302);
    const cookie = res.cookies.find((c) => c.name === 'mytime_session')!;
    const headers = { cookie: `mytime_session=${cookie.value}`, 'x-requested-with': 'mytime' };
    return {
      get: (url: string) => app.inject({ method: 'GET', url, headers }),
      send: (method: 'POST' | 'PUT', url: string, payload?: unknown) =>
        app.inject({ method, url, headers, payload: payload as object }),
      headers,
    };
  }

  const line = (hours: Record<string, number> = {}) => ({
    id: randomUUID(),
    projectNumber: '257471',
    projectName: 'Kunde E',
    taskNumber: '03',
    taskName: 'Team',
    type: 'Normal -NO',
    entries: Object.entries(hours).map(([date, h]) => ({ date, hours: h, comment: '' })),
  });

  it('requires login', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/weeks/${WEEK}` });
    expect(res.statusCode).toBe(401);
  });

  it('requires the CSRF header on mutations', async () => {
    const alice = await login('alice');
    const res = await app.inject({
      method: 'PUT',
      url: `/api/weeks/${WEEK}`,
      headers: { cookie: alice.headers.cookie },
      payload: { lines: [] },
    });
    expect(res.statusCode).toBe(403);
  });

  it('saves, submits and marks a week as modified', async () => {
    const alice = await login('alice');
    const empty = await alice.get(`/api/weeks/${WEEK}`);
    expect(empty.json()).toMatchObject({ isoWeek: 40, status: 'draft', lines: [] });

    const l = line({ '2026-09-28': 5.5, '2026-09-29': 10.5 });
    const saved = await alice.send('PUT', `/api/weeks/${WEEK}`, { lines: [l] });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().lines[0].entries).toHaveLength(2);

    const submitted = await alice.send('POST', `/api/weeks/${WEEK}/submit`);
    expect(submitted.json().status).toBe('submitted');

    const modified = await alice.send('PUT', `/api/weeks/${WEEK}`, { lines: [l] });
    expect(modified.json().status).toBe('modified');

    const flex = await alice.get('/api/flex');
    expect(flex.json()).toMatchObject({ startDate: WEEK, balance: -16 }); // -2.5 + 2.5 - 8 (ons) - 8 (tor); fredag (i dag) teller ikke
  });

  it('rejects entries outside the week', async () => {
    const alice = await login('alice');
    const res = await alice.send('PUT', `/api/weeks/${WEEK}`, {
      lines: [line({ '2026-10-05': 1 })],
    });
    expect(res.statusCode).toBe(400);
  });

  it('isolates users from each other', async () => {
    const alice = await login('alice');
    const bob = await login('bob');
    const l = line({ '2026-09-28': 3 });
    await alice.send('PUT', `/api/weeks/${WEEK}`, { lines: [l] });

    expect((await bob.get(`/api/weeks/${WEEK}`)).json().lines).toEqual([]);
    expect((await bob.get('/api/suggestions')).json()).toEqual([]);
    // Re-using another user's line id must not overwrite their data.
    const res = await bob.send('PUT', `/api/weeks/${WEEK}`, { lines: [l] });
    expect(res.statusCode).toBe(409);
    expect((await alice.get(`/api/weeks/${WEEK}`)).json().lines[0].entries[0].hours).toBe(3);
  });

  it('copies lines from the previous week without hours', async () => {
    const alice = await login('alice');
    await alice.send('PUT', '/api/weeks/2026-09-14', { lines: [line({ '2026-09-14': 4 })] });
    const res = await alice.send('POST', `/api/weeks/${WEEK}/copy-previous`);
    expect(res.statusCode).toBe(200);
    expect(res.json().lines).toHaveLength(1);
    expect(res.json().lines[0]).toMatchObject({ projectNumber: '257471', entries: [] });
    // Copying again does not duplicate lines.
    const again = await alice.send('POST', `/api/weeks/${WEEK}/copy-previous`);
    expect(again.json().lines).toHaveLength(1);
  });

  it('imports and exports xlsx', async () => {
    const alice = await login('alice');
    const boundary = '----mytime';
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="week40.xlsx"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`,
      ),
      fixture,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const preview = await app.inject({
      method: 'POST',
      url: `/api/import/preview?week=${WEEK}`,
      headers: { ...alice.headers, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });
    expect(preview.statusCode).toBe(200);
    const parsed = preview.json();
    expect(parsed.weeks).toHaveLength(1);
    expect(parsed.weeks[0]).toMatchObject({ weekStart: WEEK, totalHours: 32, existingLines: 0 });

    const commit = await alice.send('POST', '/api/import/commit', {
      weeks: parsed.weeks.map((w: { weekStart: string; lines: unknown[] }) => ({
        weekStart: w.weekStart,
        lines: w.lines,
      })),
    });
    expect(commit.statusCode).toBe(200);

    const calendar = await alice.get('/api/calendar?from=2026-09-01&to=2026-10-31');
    expect(calendar.json().find((w: { weekStart: string }) => w.weekStart === WEEK)).toMatchObject({
      isoWeek: 40,
      totalHours: 32,
    });

    const exported = await alice.get(`/api/weeks/${WEEK}/export`);
    expect(exported.statusCode).toBe(200);
    expect(exported.headers['content-disposition']).toMatch(/week40_\d{14}\.xlsx/);
    expect(exported.rawPayload.subarray(0, 2).toString()).toBe('PK');

    const week = await alice.get(`/api/weeks/${WEEK}`);
    expect(week.json().lastExportedAt).not.toBeNull();
  });

  it('updates settings', async () => {
    const alice = await login('alice');
    const res = await alice.send('PUT', '/api/settings', {
      dailyNormHours: 7.5,
      flexStartBalance: 19,
      flexStartDate: '2026-09-28',
    });
    expect(res.json()).toEqual({ dailyNormHours: 7.5, flexStartBalance: 19, flexStartDate: WEEK });
    expect((await alice.get('/api/me')).json().settings.dailyNormHours).toBe(7.5);
  });

  it('logs out', async () => {
    const alice = await login('alice');
    const res = await app.inject({ method: 'GET', url: '/auth/logout', headers: alice.headers });
    expect(res.statusCode).toBe(302);
    expect((await alice.get('/api/me')).statusCode).toBe(401);
  });

  it('only redirects to local paths after login', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/auth/login?user=alice&returnTo=//evil.example',
    });
    expect(res.headers.location).toBe('/');
  });
});
