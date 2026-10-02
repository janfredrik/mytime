import { addDays, compareISODate, isoDayOfWeek } from './dates.js';
import { holidayName } from './holidays.js';

export const DEFAULT_DAILY_NORM = 8;

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Monday–Friday that is not a Norwegian public holiday. */
export function isWorkday(date: string): boolean {
  return isoDayOfWeek(date) <= 5 && holidayName(date) === undefined;
}

export function normForDate(date: string, dailyNorm: number): number {
  return isWorkday(date) ? dailyNorm : 0;
}

/**
 * Flex for a single day: registered hours minus the norm.
 * Returns null when the day should not (yet) count: future days without registered hours,
 * non-workdays without hours, and today while it is still short of the norm (the day is
 * not over, so a deficit would be premature).
 */
export function dailyFlex(
  date: string,
  hours: number,
  dailyNorm: number,
  today: string,
): number | null {
  const norm = normForDate(date, dailyNorm);
  const order = compareISODate(date, today);
  if (order === 0 && hours < norm) return null;
  if (hours === 0 && (order > 0 || !isWorkday(date))) return null;
  return round2(hours - norm);
}

export interface FlexBalanceInput {
  /** First date that counts towards the balance. */
  startDate: string;
  /** Balance carried in at `startDate`. */
  startBalance: number;
  dailyNorm: number;
  today: string;
  /** Registered hours per date (dates without hours may be omitted). */
  hoursByDate: ReadonlyMap<string, number>;
}

/**
 * Flex balance from `startDate` up to today, including any later days that already have
 * hours registered (so the balance matches the sum of the flex shown per day).
 */
export function flexBalance(input: FlexBalanceInput): number {
  const { startDate, startBalance, dailyNorm, today, hoursByDate } = input;
  let end = today;
  for (const [date, hours] of hoursByDate) {
    if (hours !== 0 && compareISODate(date, end) > 0) end = date;
  }
  let balance = startBalance;
  for (let date = startDate; compareISODate(date, end) <= 0; date = addDays(date, 1)) {
    balance += dailyFlex(date, hoursByDate.get(date) ?? 0, dailyNorm, today) ?? 0;
  }
  return round2(balance);
}
