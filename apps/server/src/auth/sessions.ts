import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, lt } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { sessions, users } from '../db/schema.js';

export const SESSION_COOKIE = 'mytime_session';
export const LOGIN_COOKIE = 'mytime_login';

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

export async function createSession(
  db: Db,
  opts: { userId: string | null; data?: Record<string, unknown>; ttlMs: number },
): Promise<string> {
  const token = newToken();
  await db.insert(sessions).values({
    id: hash(token),
    userId: opts.userId,
    data: opts.data ?? {},
    expiresAt: new Date(Date.now() + opts.ttlMs),
  });
  return token;
}

/** Returns and deletes a pending (pre-login) session. */
export async function consumeLoginSession(db: Db, token: string) {
  const [row] = await db
    .delete(sessions)
    .where(and(eq(sessions.id, hash(token)), gt(sessions.expiresAt, new Date())))
    .returning();
  return row && row.userId === null ? row : undefined;
}

export async function findSessionUser(db: Db, token: string) {
  const [row] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, hash(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return row;
}

export async function deleteSession(db: Db, token: string) {
  const [row] = await db.delete(sessions).where(eq(sessions.id, hash(token))).returning();
  return row;
}

export async function purgeExpiredSessions(db: Db) {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}
