import {
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: text('tenant_id').notNull(),
    oid: text('oid').notNull(),
    name: text('name').notNull().default(''),
    email: text('email').notNull().default(''),
    dailyNormHours: numeric('daily_norm_hours', { precision: 4, scale: 2, mode: 'number' })
      .notNull()
      .default(8),
    flexStartBalance: numeric('flex_start_balance', { precision: 7, scale: 2, mode: 'number' })
      .notNull()
      .default(0),
    flexStartDate: date('flex_start_date', { mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('users_tenant_oid').on(t.tenantId, t.oid)],
);

export const sessions = pgTable(
  'sessions',
  {
    /** SHA-256 of the session token stored in the cookie. */
    id: text('id').primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('sessions_expires_at').on(t.expiresAt)],
);

export const timecards = pgTable(
  'timecards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    weekStart: date('week_start', { mode: 'string' }).notNull(),
    /** draft = never exported, exported = export matches the data, changed = edited since. */
    status: text('status', { enum: ['draft', 'exported', 'changed'] })
      .notNull()
      .default('draft'),
    lastExportedAt: timestamp('last_exported_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('timecards_user_week').on(t.userId, t.weekStart)],
);

export const timecardLines = pgTable(
  'timecard_lines',
  {
    id: uuid('id').primaryKey(),
    timecardId: uuid('timecard_id')
      .notNull()
      .references(() => timecards.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    projectNumber: text('project_number').notNull().default(''),
    projectName: text('project_name').notNull().default(''),
    taskNumber: text('task_number').notNull().default(''),
    taskName: text('task_name').notNull().default(''),
    type: text('type').notNull().default(''),
  },
  (t) => [index('timecard_lines_timecard').on(t.timecardId)],
);

export const timeEntries = pgTable(
  'time_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    lineId: uuid('line_id')
      .notNull()
      .references(() => timecardLines.id, { onDelete: 'cascade' }),
    date: date('date', { mode: 'string' }).notNull(),
    hours: numeric('hours', { precision: 5, scale: 2, mode: 'number' }).notNull().default(0),
    comment: text('comment').notNull().default(''),
    timeFrom: text('time_from').notNull().default(''),
    timeTo: text('time_to').notNull().default(''),
  },
  (t) => [unique('time_entries_line_date').on(t.lineId, t.date)],
);
