import {
  type CalendarWeek,
  WEEK_STATUS_LABEL,
  addDays,
  formatHours,
  isoWeekOf,
  normForDate,
  weekDates,
  weekStartOf,
} from '@mytime/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { ChevronLeft, ChevronRight } from './icons';

type Delivery = 'exported' | 'changed' | 'missing' | null;

/** What the week needs from you: nothing, a fresh export, or a first export once it is over. */
function deliveryOf(week: CalendarWeek, today: string): Delivery {
  if (week.status === 'exported') return 'exported';
  if (week.status === 'changed') return 'changed';
  if (week.totalHours > 0 && addDays(week.weekStart, 7) <= today) return 'missing';
  return null;
}

const DELIVERY_LABEL: Record<Exclude<Delivery, null>, string> = {
  exported: WEEK_STATUS_LABEL.exported,
  changed: WEEK_STATUS_LABEL.changed,
  missing: 'Ikke eksportert',
};

function DeliveryMark({ delivery }: { delivery: Delivery }) {
  if (!delivery) return null;
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className="inline-block">
      {delivery === 'exported' && <circle cx="5" cy="5" r="4" className="fill-positive" />}
      {delivery === 'changed' && <circle cx="5" cy="5" r="4" className="fill-warning" />}
      {delivery === 'missing' && (
        <circle cx="5" cy="5" r="3.25" fill="none" strokeWidth="1.5" className="stroke-negative" />
      )}
    </svg>
  );
}

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
            <th scope="col" className="w-8 py-1 font-medium">Uke</th>
            {['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag'].map((d) => (
              <th key={d} scope="col" className="py-1 font-medium">
                <abbr title={d} className="no-underline">
                  {d[0]}
                </abbr>
              </th>
            ))}
            <th className="w-10 py-1 text-right font-medium">Sum</th>
            <th className="w-5 py-1">
              <span className="sr-only">Levering</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((w) => {
            const dates = weekDates(w.weekStart);
            const selected = w.weekStart === weekStart;
            const norm = dates.reduce((s, d) => s + normForDate(d, dailyNorm), 0);
            const isFuture = w.weekStart > today;
            const delivery = deliveryOf(w, today);
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
                    className="w-full rounded-md"
                    aria-label={`Gå til uke ${w.isoWeek}${delivery ? `, ${DELIVERY_LABEL[delivery].toLowerCase()}` : ''}`}
                    aria-current={selected ? 'true' : undefined}
                  >
                    {w.isoWeek}
                  </button>
                </td>
                {dates.map((d) => (
                  <td key={d} className="py-1" aria-hidden="true">
                    <span
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${
                        d === today
                          ? 'bg-accent text-accent-ink font-semibold'
                          : d.slice(0, 7) !== month
                            ? 'text-ink-subtle'
                            : ''
                      }`}
                    >
                      {Number(d.slice(8))}
                    </span>
                  </td>
                ))}
                <td className={`py-1 pr-1 text-right ${tone}`}>{formatHours(w.totalHours)}</td>
                <td className="rounded-r-md py-1 text-center" title={delivery ? DELIVERY_LABEL[delivery] : undefined}>
                  <DeliveryMark delivery={delivery} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t border-line pt-2 text-xs text-ink-muted" aria-hidden="true">
        {(['exported', 'changed', 'missing'] as const).map((d) => (
          <span key={d} className="inline-flex items-center gap-1.5">
            <DeliveryMark delivery={d} /> {DELIVERY_LABEL[d]}
          </span>
        ))}
      </div>
    </div>
  );
}
