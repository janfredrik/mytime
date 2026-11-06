import { addDays, compareISODate, isoDayOfWeek, weekStartOf } from './dates.js';
import { holidayName } from './holidays.js';

export const DEFAULT_DAILY_NORM = 8;

/** Projects whose hours are paid separately and do not count towards flex (OnCall247 - CAT). */
export const FLEX_EXCLUDED_PROJECTS: readonly string[] = ['245784'];

export function countsTowardsFlex(projectNumber: string): boolean {
  return !FLEX_EXCLUDED_PROJECTS.includes(projectNumber.trim());
}

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
 * Returns null when the day should not (yet) count: future days and today without
 * registered hours, and non-workdays without hours. Once today has hours it counts in full,
 * deficit included.
 */
export function dailyFlex(
  date: string,
  hours: number,
  dailyNorm: number,
  today: string,
): number | null {
  const norm = normForDate(date, dailyNorm);
  const order = compareISODate(date, today);
  if (hours === 0 && (order >= 0 || !isWorkday(date))) return null;
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

export interface FlexWeek {
  weekStart: string;
  /** Flex earned that week (only days from the start date count). */
  flex: number;
  /** Balance at the end of the week. */
  balance: number;
}

/**
 * Week-by-week flex from the week containing `startDate` up to the current week (or a later
 * week that already has hours). The last balance equals `flexBalance`.
 */
export function flexHistory(input: FlexBalanceInput): FlexWeek[] {
  const { startDate, startBalance, dailyNorm, today, hoursByDate } = input;
  let end = today;
  for (const [date, hours] of hoursByDate) {
    if (hours !== 0 && compareISODate(date, end) > 0) end = date;
  }
  const weeks: FlexWeek[] = [];
  let balance = startBalance;
  for (let week = weekStartOf(startDate); compareISODate(week, end) <= 0; week = addDays(week, 7)) {
    let flex = 0;
    for (let i = 0; i < 7; i++) {
      const date = addDays(week, i);
      if (compareISODate(date, startDate) < 0 || compareISODate(date, end) > 0) continue;
      flex += dailyFlex(date, hoursByDate.get(date) ?? 0, dailyNorm, today) ?? 0;
    }
    balance += flex;
    weeks.push({ weekStart: week, flex: round2(flex), balance: round2(balance) });
  }
  return weeks;
}
