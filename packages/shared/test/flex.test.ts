import { describe, expect, it } from 'vitest';
import {
  dailyFlex,
  easterSunday,
  flexBalance,
  formatHoursExport,
  holidayName,
  parseHours,
} from '../src/index.js';

describe('holidays', () => {
  it('computes Easter and Norwegian holidays', () => {
    expect(easterSunday(2026)).toBe('2026-04-05');
    expect(holidayName('2026-04-03')).toBe('Langfredag');
    expect(holidayName('2026-05-14')).toBe('Kristi himmelfartsdag');
    expect(holidayName('2026-05-17')).toBe('Grunnlovsdag');
    expect(holidayName('2026-09-28')).toBeUndefined();
  });
});

describe('flex', () => {
  const today = '2026-10-02';

  it('matches the example week (8 h norm)', () => {
    const week = [
      ['2026-09-28', 5.5, -2.5],
      ['2026-09-29', 10.5, 2.5],
      ['2026-09-30', 6.5, -1.5],
      ['2026-10-01', 9.5, 1.5],
    ] as const;
    for (const [date, hours, flex] of week) expect(dailyFlex(date, hours, 8, today)).toBe(flex);
  });

  it('leaves today/future and weekends without hours blank', () => {
    expect(dailyFlex('2026-10-02', 0, 8, today)).toBeNull();
    expect(dailyFlex('2026-10-05', 0, 8, today)).toBeNull();
    expect(dailyFlex('2026-10-03', 0, 8, today)).toBeNull();
    expect(dailyFlex('2026-09-25', 0, 8, today)).toBe(-8);
  });

  it('counts weekend and holiday hours fully as flex', () => {
    expect(dailyFlex('2026-10-03', 3, 8, today)).toBe(3);
    expect(dailyFlex('2026-05-17', 0, 8, today)).toBeNull();
    expect(dailyFlex('2026-05-14', 2, 8, today)).toBe(2);
  });

  it('sums a balance from a start date', () => {
    const hoursByDate = new Map([
      ['2026-09-28', 5.5],
      ['2026-09-29', 10.5],
      ['2026-09-30', 6.5],
      ['2026-10-01', 9.5],
    ]);
    expect(
      flexBalance({ startDate: '2026-09-28', startBalance: 19, dailyNorm: 8, today, hoursByDate }),
    ).toBe(19);
    // Future hours are included so the balance matches the flex shown per day.
    hoursByDate.set('2026-10-05', 9);
    expect(
      flexBalance({ startDate: '2026-09-28', startBalance: 0, dailyNorm: 8, today, hoursByDate }),
    ).toBe(1);
  });
});

describe('format', () => {
  it('formats hours like the existing export', () => {
    expect(formatHoursExport(5)).toBe('5.0');
    expect(formatHoursExport(0.5)).toBe('0.5');
    expect(formatHoursExport(0.25)).toBe('0.25');
  });

  it('parses hours with comma or dot', () => {
    expect(parseHours('5,5')).toBe(5.5);
    expect(parseHours(' 2 ')).toBe(2);
    expect(parseHours('')).toBeNull();
    expect(parseHours('abc')).toBeNull();
    expect(parseHours(7.5)).toBe(7.5);
  });
});
