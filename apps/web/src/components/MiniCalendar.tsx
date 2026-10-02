import { type CalendarWeek, addDays, formatHours, isoWeekOf, normForDate, weekDates, weekStartOf } from '@mytime/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { ChevronLeft, ChevronRight } from './icons';

const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];

function monthOf(weekStart: string) {
  return addDays(weekStart, 3).slice(0, 7); // the Thursday decides
}

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

function lastDayOfMonth(month: string) {
  return addDays(`${shiftMonth(month, 1)}-01`, -1);
}

export function MiniCalendar({
  weekStart,
  today,
  dailyNorm,
  onSelectWeek,
}: {
  weekStart: string;
  today: string;
  dailyNorm: number;
  onSelectWeek: (weekStart: string) => void;
}) {
  const [month, setMonth] = useState(() => monthOf(weekStart));
  useEffect(() => setMonth(monthOf(weekStart)), [weekStart]);

  const from = weekStartOf(`${month}-01`);
  const to = lastDayOfMonth(month);
  const { data } = useQuery({
    queryKey: ['calendar', from, to],
    queryFn: () => api.calendar(from, to),
  });

  const weeks: CalendarWeek[] = [];
  for (let w = from; w <= to; w = addDays(w, 7)) {
    weeks.push(
      data?.find((c) => c.weekStart === w) ?? { weekStart: w, isoWeek: isoWeekOf(w).week, totalHours: 0, status: null },
    );
  }
  const [year, monthNum] = month.split('-').map(Number) as [number, number];

  return (
    <div className="rounded-xl border border-line bg-surface p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          aria-label="Forrige måned"
          onClick={() => setMonth(shiftMonth(month, -1))}
          className="rounded-md p-1 text-ink-muted hover:bg-hover hover:text-ink"
        >
          <ChevronLeft />
        </button>
        <div className="text-sm font-semibold capitalize">
          {MONTHS[monthNum - 1]} {year}
        </div>
        <button
          type="button"
          aria-label="Neste måned"
          onClick={() => setMonth(shiftMonth(month, 1))}
          className="rounded-md p-1 text-ink-muted hover:bg-hover hover:text-ink"
        >
          <ChevronRight />
        </button>
      </div>
      <table className="w-full text-center text-xs tabular">
        <thead>
          <tr className="text-ink-subtle">
            <th className="w-8 py-1 font-medium">Uke</th>
            {['M', 'T', 'O', 'T', 'F', 'L', 'S'].map((d, i) => (
              <th key={i} className="py-1 font-medium">
                {d}
              </th>
            ))}
            <th className="w-10 py-1 text-right font-medium">Sum</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((w) => {
            const dates = weekDates(w.weekStart);
            const selected = w.weekStart === weekStart;
            const norm = dates.reduce((s, d) => s + normForDate(d, dailyNorm), 0);
            const isFuture = w.weekStart > today;
            const tone =
              w.totalHours === 0
                ? 'text-ink-subtle'
                : w.totalHours >= norm
                  ? 'text-positive font-semibold'
                  : isFuture
                    ? 'text-ink-muted'
                    : 'text-warning font-semibold';
            return (
              <tr
                key={w.weekStart}
                onClick={() => onSelectWeek(w.weekStart)}
                className={`cursor-pointer ${selected ? 'bg-accent-soft' : 'hover:bg-hover'}`}
              >
                <td className={`rounded-l-md py-1 font-semibold ${selected ? 'text-accent' : 'text-ink-muted'}`}>
                  <button
                    type="button"
                    className="w-full"
                    aria-label={`Gå til uke ${w.isoWeek}`}
                    aria-current={selected ? 'true' : undefined}
                  >
                    {w.isoWeek}
                  </button>
                </td>
                {dates.map((d) => (
                  <td key={d} className="py-1">
                    <span
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${
                        d === today
                          ? 'bg-accent text-accent-ink font-semibold'
                          : d.slice(0, 7) !== month
                            ? 'text-ink-subtle/60'
                            : ''
                      }`}
                    >
                      {Number(d.slice(8))}
                    </span>
                  </td>
                ))}
                <td className={`rounded-r-md py-1 pr-1 text-right ${tone}`}>{formatHours(w.totalHours)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
