import { describe, expect, it } from 'vitest';
import {
  addDays,
  isValidISODate,
  isoWeekOf,
  todayISO,
  weekDates,
  weekStartFromIsoWeek,
  weekStartOf,
} from '../src/index.js';

describe('dates', () => {
  it('validates ISO dates', () => {
    expect(isValidISODate('2026-09-28')).toBe(true);
    expect(isValidISODate('2026-02-30')).toBe(false);
    expect(isValidISODate('28.09.2026')).toBe(false);
  });

  it('finds the Monday of a week', () => {
    expect(weekStartOf('2026-10-02')).toBe('2026-09-28');
    expect(weekStartOf('2026-10-04')).toBe('2026-09-28');
    expect(weekStartOf('2026-09-28')).toBe('2026-09-28');
  });

  it('computes ISO week numbers, also around new year', () => {
    expect(isoWeekOf('2026-09-28')).toEqual({ year: 2026, week: 40 });
    expect(isoWeekOf('2026-01-01')).toEqual({ year: 2026, week: 1 });
    expect(isoWeekOf('2027-01-01')).toEqual({ year: 2026, week: 53 });
    expect(isoWeekOf('2024-12-30')).toEqual({ year: 2025, week: 1 });
    expect(weekStartFromIsoWeek(2026, 40)).toBe('2026-09-28');
    expect(weekStartFromIsoWeek(2025, 1)).toBe('2024-12-30');
  });

  it('lists the dates of a week', () => {
    expect(weekDates('2026-09-28')).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ]);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('uses Oslo time for today', () => {
    expect(todayISO(new Date('2026-10-01T22:30:00Z'))).toBe('2026-10-02');
  });
});
