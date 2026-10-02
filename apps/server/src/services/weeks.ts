import {
  type CalendarWeek,
  type FlexSummary,
  type Line,
  type LineDescriptor,
  type Week,
  addDays,
  compareISODate,
  flexBalance,
  isMeaningfulEntry,
  isoWeekOf,
  lineKey,
  weekDates,
  weekStartOf,
} from '@mytime/shared';
import { and, asc, between, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Db } from '../db/client.js';
import { timeEntries, timecardLines, timecards } from '../db/schema.js';
import { HttpError, badRequest } from '../errors.js';
import type { User } from '../auth/plugin.js';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Executor = Db | Tx;

async function loadLines(db: Executor, timecardId: string): Promise<Line[]> {
  const lines = await db
    .select()
    .from(timecardLines)
    .where(eq(timecardLines.timecardId, timecardId))
    .orderBy(asc(timecardLines.position));
  if (lines.length === 0) return [];
  const entries = await db
    .select()
    .from(timeEntries)
    .where(
      inArray(
        timeEntries.lineId,
        lines.map((l) => l.id),
      ),
    )
    .orderBy(asc(timeEntries.date));
  return lines.map((l) => ({
    id: l.id,
    projectNumber: l.projectNumber,
    projectName: l.projectName,
    taskNumber: l.taskNumber,
    taskName: l.taskName,
    type: l.type,
    entries: entries
      .filter((e) => e.lineId === l.id)
      .map((e) => ({
        date: e.date,
        hours: e.hours,
        comment: e.comment,
        timeFrom: e.timeFrom,
        timeTo: e.timeTo,
      })),
  }));
}

async function findTimecard(db: Executor, userId: string, weekStart: string) {
  const [tc] = await db
    .select()
    .from(timecards)
    .where(and(eq(timecards.userId, userId), eq(timecards.weekStart, weekStart)))
    .limit(1);
  return tc;
}

export async function getWeek(db: Executor, userId: string, weekStart: string): Promise<Week> {
  const tc = await findTimecard(db, userId, weekStart);
  const { year, week } = isoWeekOf(weekStart);
  return {
    weekStart,
    isoYear: year,
    isoWeek: week,
    status: tc?.status ?? 'draft',
    submittedAt: tc?.submittedAt?.toISOString() ?? null,
    lastExportedAt: tc?.lastExportedAt?.toISOString() ?? null,
    lines: tc ? await loadLines(db, tc.id) : [],
  };
}

/** Validate and normalise lines for a week. Throws 400 on invalid input. */
export function normaliseLines(weekStart: string, lines: Line[]): Line[] {
  const dates = new Set(weekDates(weekStart));
  const ids = new Set<string>();
  return lines.map((line) => {
    if (ids.has(line.id)) throw badRequest(`Linje-ID ${line.id} er brukt flere ganger`);
    ids.add(line.id);
    const seen = new Set<string>();
    const entries = line.entries
      .filter(isMeaningfulEntry)
      .map((e) => {
        if (!dates.has(e.date)) throw badRequest(`Datoen ${e.date} er ikke i uka ${weekStart}`);
        if (seen.has(e.date)) throw badRequest(`Dobbel føring på ${e.date} for samme linje`);
        seen.add(e.date);
        return { ...e, hours: Math.round(e.hours * 100) / 100 };
      })
      .sort((a, b) => compareISODate(a.date, b.date));
    return { ...line, entries };
  });
}

export async function saveWeek(
  db: Db,
  userId: string,
  weekStart: string,
  input: Line[],
): Promise<Week> {
  const lines = normaliseLines(weekStart, input);
  try {
    return await db.transaction(async (tx) => {
      const [tc] = await tx
        .insert(timecards)
        .values({ userId, weekStart })
        .onConflictDoUpdate({
          target: [timecards.userId, timecards.weekStart],
          set: {
            updatedAt: sql`now()`,
            status: sql`case when ${timecards.status} = 'draft' then 'draft' else 'modified' end`,
          },
        })
        .returning();
      await tx.delete(timecardLines).where(eq(timecardLines.timecardId, tc!.id));
      if (lines.length > 0) {
        await tx.insert(timecardLines).values(
          lines.map((l, position) => ({
            id: l.id,
            timecardId: tc!.id,
            position,
            projectNumber: l.projectNumber,
            projectName: l.projectName,
            taskNumber: l.taskNumber,
            taskName: l.taskName,
            type: l.type,
          })),
        );
        const entries = lines.flatMap((l) => l.entries.map((e) => ({ ...e, lineId: l.id })));
        if (entries.length > 0) await tx.insert(timeEntries).values(entries);
      }
      return getWeek(tx, userId, weekStart);
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new HttpError(409, 'Linje-ID er allerede i bruk');
    throw err;
  }
}

function isUniqueViolation(err: unknown): boolean {
  let e: unknown = err;
  while (e && typeof e === 'object') {
    if ('code' in e && (e as { code: unknown }).code === '23505') return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

export async function submitWeek(db: Db, userId: string, weekStart: string): Promise<Week> {
  await db
    .insert(timecards)
    .values({ userId, weekStart, status: 'submitted', submittedAt: new Date() })
    .onConflictDoUpdate({
      target: [timecards.userId, timecards.weekStart],
      set: { status: 'submitted', submittedAt: sql`now()`, updatedAt: sql`now()` },
    });
  return getWeek(db, userId, weekStart);
}

export async function markExported(db: Db, userId: string, weekStart: string): Promise<void> {
  await db
    .insert(timecards)
    .values({ userId, weekStart, lastExportedAt: new Date() })
    .onConflictDoUpdate({
      target: [timecards.userId, timecards.weekStart],
      set: { lastExportedAt: sql`now()` },
    });
}

/** Copy the lines (without hours) from the latest earlier week that has lines. */
export async function copyPreviousWeek(db: Db, userId: string, weekStart: string): Promise<Week> {
  const previous = await db
    .select({ id: timecards.id })
    .from(timecards)
    .where(
      and(
        eq(timecards.userId, userId),
        lt(timecards.weekStart, weekStart),
        sql`exists (select 1 from ${timecardLines} where ${timecardLines.timecardId} = ${timecards.id})`,
      ),
    )
    .orderBy(desc(timecards.weekStart))
    .limit(1);
  const source = previous[0];
  if (!source) throw new HttpError(404, 'Fant ingen tidligere uke med linjer');

  const current = await getWeek(db, userId, weekStart);
  const existing = new Set(current.lines.map(lineKey));
  const copied = (await loadLines(db, source.id))
    .filter((l) => !existing.has(lineKey(l)))
    .map((l) => ({ ...l, id: randomUUID(), entries: [] }));
  if (copied.length === 0) return current;
  return saveWeek(db, userId, weekStart, [...current.lines, ...copied]);
}

export async function calendar(
  db: Db,
  userId: string,
  from: string,
  to: string,
): Promise<CalendarWeek[]> {
  const start = weekStartOf(from);
  const end = weekStartOf(to);
  if (compareISODate(start, end) > 0) throw badRequest('Ugyldig periode');
  if (compareISODate(addDays(start, 7 * 60), end) < 0) throw badRequest('For lang periode');

  const rows = await db
    .select({
      weekStart: timecards.weekStart,
      status: timecards.status,
      total: sql<string>`coalesce(sum(${timeEntries.hours}), 0)`,
    })
    .from(timecards)
    .leftJoin(timecardLines, eq(timecardLines.timecardId, timecards.id))
    .leftJoin(timeEntries, eq(timeEntries.lineId, timecardLines.id))
    .where(and(eq(timecards.userId, userId), between(timecards.weekStart, start, end)))
    .groupBy(timecards.id);
  const byWeek = new Map(rows.map((r) => [r.weekStart, r]));

  const weeks: CalendarWeek[] = [];
  for (let w = start; compareISODate(w, end) <= 0; w = addDays(w, 7)) {
    const row = byWeek.get(w);
    weeks.push({
      weekStart: w,
      isoWeek: isoWeekOf(w).week,
      totalHours: row ? Number(row.total) : 0,
      status: row?.status ?? null,
    });
  }
  return weeks;
}

/** Distinct line descriptors the user has used, most recently used first. */
export async function suggestions(db: Db, userId: string): Promise<LineDescriptor[]> {
  return db
    .select({
      projectNumber: timecardLines.projectNumber,
      projectName: timecardLines.projectName,
      taskNumber: timecardLines.taskNumber,
      taskName: timecardLines.taskName,
      type: timecardLines.type,
    })
    .from(timecardLines)
    .innerJoin(timecards, eq(timecards.id, timecardLines.timecardId))
    .where(eq(timecards.userId, userId))
    .groupBy(
      timecardLines.projectNumber,
      timecardLines.projectName,
      timecardLines.taskNumber,
      timecardLines.taskName,
      timecardLines.type,
    )
    .orderBy(desc(sql`max(${timecards.weekStart})`))
    .limit(500);
}

export async function flexSummary(db: Db, user: User, today: string): Promise<FlexSummary> {
  const rows = await db
    .select({ date: timeEntries.date, hours: sql<string>`sum(${timeEntries.hours})` })
    .from(timeEntries)
    .innerJoin(timecardLines, eq(timecardLines.id, timeEntries.lineId))
    .innerJoin(timecards, eq(timecards.id, timecardLines.timecardId))
    .where(eq(timecards.userId, user.id))
    .groupBy(timeEntries.date);
  const hoursByDate = new Map(rows.map((r) => [r.date, Number(r.hours)]));
  const firstDate = rows.map((r) => r.date).sort(compareISODate)[0];
  const startDate = user.flexStartDate ?? (firstDate ? weekStartOf(firstDate) : null);
  if (!startDate) return { balance: user.flexStartBalance, startDate: null, today };
  return {
    balance: flexBalance({
      startDate,
      startBalance: user.flexStartBalance,
      dailyNorm: user.dailyNormHours,
      today,
      hoursByDate,
    }),
    startDate,
    today,
  };
}
