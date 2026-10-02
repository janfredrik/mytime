import { z } from 'zod';
import { isValidISODate } from './dates.js';

export const isoDateSchema = z
  .string()
  .refine(isValidISODate, { message: 'Ugyldig dato (forventet ÅÅÅÅ-MM-DD)' });

export const MAX_HOURS_PER_ENTRY = 24;

export const entrySchema = z.object({
  date: isoDateSchema,
  hours: z.number().min(0).max(MAX_HOURS_PER_ENTRY),
  comment: z.string().max(4000).default(''),
  timeFrom: z.string().max(20).default(''),
  timeTo: z.string().max(20).default(''),
});
export type Entry = z.infer<typeof entrySchema>;

const field = (max: number) => z.string().trim().max(max).default('');

export const lineSchema = z.object({
  id: z.uuid(),
  projectNumber: field(100),
  projectName: field(300),
  taskNumber: field(100),
  taskName: field(300),
  type: field(200),
  entries: z.array(entrySchema).max(7).default([]),
});
export type Line = z.infer<typeof lineSchema>;

/** Line as described by the user, without identity or hours. */
export type LineDescriptor = Pick<
  Line,
  'projectNumber' | 'projectName' | 'taskNumber' | 'taskName' | 'type'
>;

export const saveWeekSchema = z.object({
  lines: z.array(lineSchema).max(300),
});
export type SaveWeek = z.infer<typeof saveWeekSchema>;

export const weekStatusSchema = z.enum(['draft', 'submitted', 'modified']);
export type WeekStatus = z.infer<typeof weekStatusSchema>;

export const WEEK_STATUS_LABEL: Record<WeekStatus, string> = {
  draft: 'Utkast',
  submitted: 'Sendt inn',
  modified: 'Endret etter innsending',
};

export interface Week {
  weekStart: string;
  isoYear: number;
  isoWeek: number;
  status: WeekStatus;
  submittedAt: string | null;
  lastExportedAt: string | null;
  lines: Line[];
}

export const settingsSchema = z.object({
  dailyNormHours: z.number().min(0).max(24),
  flexStartBalance: z.number().min(-1000).max(1000),
  flexStartDate: isoDateSchema.nullable(),
});
export type Settings = z.infer<typeof settingsSchema>;

export interface Me {
  id: string;
  name: string;
  email: string;
  settings: Settings;
}

export interface FlexSummary {
  balance: number;
  startDate: string | null;
  today: string;
}

export interface CalendarWeek {
  weekStart: string;
  isoWeek: number;
  totalHours: number;
  status: WeekStatus | null;
}

export interface ImportedWeek {
  weekStart: string;
  lines: Line[];
}

export interface ImportIssue {
  row: number;
  message: string;
}

export interface ImportPreview {
  weeks: (ImportedWeek & { existingLines: number; totalHours: number })[];
  warnings: ImportIssue[];
  errors: ImportIssue[];
}

export const importCommitSchema = z.object({
  weeks: z
    .array(z.object({ weekStart: isoDateSchema, lines: z.array(lineSchema).max(300) }))
    .min(1)
    .max(60),
});
export type ImportCommit = z.infer<typeof importCommitSchema>;

export function lineKey(line: LineDescriptor): string {
  return [line.projectNumber, line.projectName, line.taskNumber, line.taskName, line.type]
    .map((part) => part.trim())
    .join('\u001f');
}

/** "4 - Lunch" style label used in the grid; falls back gracefully when parts are missing. */
export function joinNumberName(number: string, name: string): string {
  if (number && name) return `${number} - ${name}`;
  return number || name;
}

export function lineTotal(line: Line): number {
  return line.entries.reduce((sum, e) => sum + e.hours, 0);
}

export function hoursByDate(lines: readonly Line[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const line of lines) {
    for (const e of line.entries) totals.set(e.date, (totals.get(e.date) ?? 0) + e.hours);
  }
  return totals;
}

/** An entry carries information worth keeping (hours or any text). */
export function isMeaningfulEntry(e: Entry): boolean {
  return e.hours > 0 || e.comment.trim() !== '' || e.timeFrom !== '' || e.timeTo !== '';
}
