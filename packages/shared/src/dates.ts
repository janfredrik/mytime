/**
 * Date helpers working on ISO date strings (YYYY-MM-DD).
 * All arithmetic is done in UTC so results never depend on the host time zone.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export const APP_TIME_ZONE = 'Europe/Oslo';

export function isValidISODate(value: string): boolean {
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return formatISODate(d) === value;
}

export function parseISODate(value: string): Date {
  if (!isValidISODate(value)) throw new Error(`Ugyldig dato: ${value}`);
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
}

export function formatISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return formatISODate(new Date(parseISODate(date).getTime() + days * DAY_MS));
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseISODate(to).getTime() - parseISODate(from).getTime()) / DAY_MS);
}

/** ISO day of week: 1 = Monday … 7 = Sunday. */
export function isoDayOfWeek(date: string): number {
  const d = parseISODate(date).getUTCDay();
  return d === 0 ? 7 : d;
}

/** Monday of the ISO week containing `date`. */
export function weekStartOf(date: string): string {
  return addDays(date, 1 - isoDayOfWeek(date));
}

export function isWeekStart(date: string): boolean {
  return isValidISODate(date) && isoDayOfWeek(date) === 1;
}

/** The 7 dates (Mon–Sun) of the week starting on `weekStart`. */
export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export interface IsoWeek {
  year: number;
  week: number;
}

export function isoWeekOf(date: string): IsoWeek {
  // The Thursday of the week decides which year the week belongs to.
  const thursday = addDays(weekStartOf(date), 3);
  const year = Number(thursday.slice(0, 4));
  const jan4 = `${year}-01-04`;
  const week = Math.round(daysBetween(weekStartOf(jan4), weekStartOf(date)) / 7) + 1;
  return { year, week };
}

export function weekStartFromIsoWeek(year: number, week: number): string {
  return addDays(weekStartOf(`${year}-01-04`), (week - 1) * 7);
}

/** Today's date in the application time zone (Europe/Oslo). */
export function todayISO(now: Date = new Date(), timeZone: string = APP_TIME_ZONE): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function compareISODate(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
