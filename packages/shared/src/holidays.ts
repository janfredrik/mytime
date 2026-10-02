import { addDays, formatISODate } from './dates.js';

/** Easter Sunday (Gregorian calendar, anonymous algorithm). */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return formatISODate(new Date(Date.UTC(year, month - 1, day)));
}

const cache = new Map<number, Map<string, string>>();

/** Norwegian public holidays (helligdager) for a year, keyed by ISO date. */
export function norwegianHolidays(year: number): Map<string, string> {
  const cached = cache.get(year);
  if (cached) return cached;
  const easter = easterSunday(year);
  const holidays = new Map<string, string>([
    [`${year}-01-01`, 'Første nyttårsdag'],
    [addDays(easter, -3), 'Skjærtorsdag'],
    [addDays(easter, -2), 'Langfredag'],
    [easter, 'Første påskedag'],
    [addDays(easter, 1), 'Andre påskedag'],
    [`${year}-05-01`, 'Arbeidernes dag'],
    [`${year}-05-17`, 'Grunnlovsdag'],
    [addDays(easter, 39), 'Kristi himmelfartsdag'],
    [addDays(easter, 49), 'Første pinsedag'],
    [addDays(easter, 50), 'Andre pinsedag'],
    [`${year}-12-25`, 'Første juledag'],
    [`${year}-12-26`, 'Andre juledag'],
  ]);
  cache.set(year, holidays);
  return holidays;
}

export function holidayName(date: string): string | undefined {
  return norwegianHolidays(Number(date.slice(0, 4))).get(date);
}
