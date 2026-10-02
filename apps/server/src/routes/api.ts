import {
  type ImportPreview,
  type Me,
  importCommitSchema,
  isValidISODate,
  isWeekStart,
  lineTotal,
  saveWeekSchema,
  settingsSchema,
  todayISO,
} from '@mytime/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import type { User } from '../auth/plugin.js';
import type { Db } from '../db/client.js';
import { users } from '../db/schema.js';
import { badRequest } from '../errors.js';
import * as weeks from '../services/weeks.js';
import { buildTimecardXlsx, exportFileName } from '../xlsx/export.js';
import { parseTimecardXlsx } from '../xlsx/import.js';

function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw badRequest(`Ugyldig forespørsel: ${issue?.path.join('.')} ${issue?.message}`.trim());
  }
  return result.data;
}

function weekParam(req: FastifyRequest): string {
  const { weekStart } = req.params as { weekStart: string };
  if (!isWeekStart(weekStart)) throw badRequest('Uke må angis som mandagens dato (ÅÅÅÅ-MM-DD)');
  return weekStart;
}

function toMe(user: User): Me {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    settings: {
      dailyNormHours: user.dailyNormHours,
      flexStartBalance: user.flexStartBalance,
      flexStartDate: user.flexStartDate,
    },
  };
}

export async function registerApi(
  app: FastifyInstance,
  deps: {
    db: Db;
    requireUser: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
    today?: () => string;
  },
) {
  const { db, requireUser } = deps;
  const today = deps.today ?? (() => todayISO());

  await app.register(
    async (api) => {
      api.addHook('preHandler', requireUser);
      const user = (req: FastifyRequest) => req.user!;

      api.get('/me', async (req) => toMe(user(req)));

      api.get('/settings', async (req) => toMe(user(req)).settings);
      api.put('/settings', async (req) => {
        const body = parse(settingsSchema, req.body);
        const [updated] = await db
          .update(users)
          .set({
            dailyNormHours: body.dailyNormHours,
            flexStartBalance: body.flexStartBalance,
            flexStartDate: body.flexStartDate,
          })
          .where(eq(users.id, user(req).id))
          .returning();
        return toMe(updated!).settings;
      });

      api.get('/flex', async (req) => weeks.flexSummary(db, user(req), today()));

      api.get('/calendar', async (req) => {
        const { from, to } = req.query as { from?: string; to?: string };
        if (!from || !to || !isValidISODate(from) || !isValidISODate(to)) {
          throw badRequest('from og to må være datoer (ÅÅÅÅ-MM-DD)');
        }
        return weeks.calendar(db, user(req).id, from, to);
      });

      api.get('/suggestions', async (req) => weeks.suggestions(db, user(req).id));

      api.get('/weeks/:weekStart', async (req) => weeks.getWeek(db, user(req).id, weekParam(req)));

      api.put('/weeks/:weekStart', async (req) => {
        const weekStart = weekParam(req);
        const body = parse(saveWeekSchema, req.body);
        return weeks.saveWeek(db, user(req).id, weekStart, body.lines);
      });

      api.post('/weeks/:weekStart/submit', async (req) =>
        weeks.submitWeek(db, user(req).id, weekParam(req)),
      );

      api.post('/weeks/:weekStart/copy-previous', async (req) =>
        weeks.copyPreviousWeek(db, user(req).id, weekParam(req)),
      );

      api.get('/weeks/:weekStart/export', async (req, reply) => {
        const weekStart = weekParam(req);
        const week = await weeks.getWeek(db, user(req).id, weekStart);
        const now = new Date();
        const file = buildTimecardXlsx(week.lines, now);
        await weeks.markExported(db, user(req).id, weekStart);
        return reply
          .header(
            'content-type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          )
          .header(
            'content-disposition',
            `attachment; filename="${exportFileName(weekStart, now)}"`,
          )
          .header('cache-control', 'no-store')
          .send(Buffer.from(file));
      });

      api.post('/import/preview', async (req): Promise<ImportPreview> => {
        const { week } = req.query as { week?: string };
        if (!week || !isWeekStart(week)) throw badRequest('Mangler gjeldende uke');
        const file = await req.file();
        if (!file) throw badRequest('Mangler fil');
        const buffer = await file.toBuffer();
        const parsed = await parseTimecardXlsx(buffer, week);
        const withExisting = await Promise.all(
          parsed.weeks.map(async (w) => {
            const existing = await weeks.getWeek(db, user(req).id, w.weekStart);
            return {
              ...w,
              existingLines: existing.lines.length,
              totalHours: w.lines.reduce((sum, l) => sum + lineTotal(l), 0),
            };
          }),
        );
        return { ...parsed, weeks: withExisting };
      });

      api.post('/import/commit', async (req) => {
        const body = parse(importCommitSchema, req.body);
        for (const w of body.weeks) {
          if (!isWeekStart(w.weekStart)) throw badRequest(`${w.weekStart} er ikke en mandag`);
        }
        const saved = [];
        for (const w of body.weeks) {
          saved.push(await weeks.saveWeek(db, user(req).id, w.weekStart, w.lines));
        }
        return { weeks: saved.map((w) => ({ weekStart: w.weekStart, lines: w.lines.length })) };
      });
    },
    { prefix: '/api' },
  );
}
