import { formatHours, isoWeekOf, weekStartFromIsoWeek, weekStartOf, todayISO } from '@mytime/shared';

const DAY_NAMES = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];
export const dayName = (index: number) => DAY_NAMES[index] ?? '';

/** "28.09" */
export function shortDate(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
}

/** "28.09.2026" */
export function longDate(iso: string): string {
  return `${shortDate(iso)}.${iso.slice(0, 4)}`;
}

export function dateTime(isoTimestamp: string): string {
  return new Intl.DateTimeFormat('nb-NO', {
    timeZone: 'Europe/Oslo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(isoTimestamp));
}

export function hours(value: number): string {
  return formatHours(value);
}

export function signedHours(value: number): string {
  if (value === 0) return '0';
  return (value > 0 ? '+' : '') + formatHours(value);
}

/** Week in the URL: ?uke=2026-40 */
export function weekFromUrl(): string {
  const param = new URLSearchParams(window.location.search).get('uke');
  const m = param && /^(\d{4})-(\d{1,2})$/.exec(param);
  if (m) {
    const week = Number(m[2]);
    if (week >= 1 && week <= 53) return weekStartFromIsoWeek(Number(m[1]), week);
  }
  return weekStartOf(todayISO());
}

export function weekToUrlParam(weekStart: string): string {
  const { year, week } = isoWeekOf(weekStart);
  return `${year}-${week}`;
}
