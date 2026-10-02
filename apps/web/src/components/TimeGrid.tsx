import {
  type Entry,
  type Line,
  formatHours,
  holidayName,
  isoDayOfWeek,
  joinNumberName,
  lineTotal,
  normForDate,
  parseHours,
  round2,
} from '@mytime/shared';
import { memo, useCallback, useEffect, useState } from 'react';
import { dayName, shortDate, signedHours } from '../lib/format';
import { emptyEntry, entryFor, moveItem, setEntry } from '../lib/lines';
import { EntryPopover } from './EntryPopover';
import { ArrowDown, ArrowUp, Comment, Copy, Plus, Trash } from './icons';
import { IconButton } from './ui';

export interface GridDay {
  date: string;
  index: number;
  isToday: boolean;
  isOff: boolean;
  holiday?: string;
}

export function gridDays(dates: string[], today: string): GridDay[] {
  return dates.map((date, index) => {
    const holiday = holidayName(date);
    return {
      date,
      index,
      isToday: date === today,
      isOff: isoDayOfWeek(date) > 5 || holiday !== undefined,
      holiday,
    };
  });
}

function dayBg(day: GridDay) {
  if (day.isToday) return 'bg-today';
  if (day.isOff) return 'bg-weekend';
  return '';
}

function focusCell(row: number, col: number) {
  const el = document.querySelector<HTMLInputElement>(`[data-cell="${row}:${col}"]`);
  el?.focus();
}

interface HourCellProps {
  entry: Entry | undefined;
  row: number;
  col: number;
  rowCount: number;
  label: string;
  onCommit: (row: number, col: number, hours: number) => void;
  onDetails: (row: number, col: number, anchor: HTMLElement) => void;
}

const HourCell = memo(function HourCell({
  entry,
  row,
  col,
  rowCount,
  label,
  onCommit,
  onDetails,
}: HourCellProps) {
  const display = entry && entry.hours > 0 ? formatHours(entry.hours) : '';
  const [text, setText] = useState(display);
  const [focused, setFocused] = useState(false);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    if (!focused) setText(display);
  }, [display, focused]);

  const commit = () => {
    const value = parseHours(text);
    if (text.trim() !== '' && (value === null || value < 0 || value > 24)) {
      setInvalid(true);
      setText(display);
      setTimeout(() => setInvalid(false), 1200);
      return;
    }
    const hours = round2(value ?? 0);
    if (hours !== (entry?.hours ?? 0)) onCommit(row, col, hours);
  };

  const move = (dRow: number, dCol: number) => {
    commit();
    const r = row + dRow;
    const c = col + dCol;
    if (r >= 0 && r < rowCount && c >= 0 && c < 7) focusCell(r, c);
  };

  const hasComment = !!entry && (entry.comment !== '' || entry.timeFrom !== '' || entry.timeTo !== '');

  return (
    <div className="group/cell relative">
      <input
        data-cell={`${row}:${col}`}
        inputMode="decimal"
        autoComplete="off"
        aria-label={label}
        title={entry?.comment || undefined}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => {
          setFocused(true);
          e.currentTarget.select();
        }}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onKeyDown={(e) => {
          const input = e.currentTarget;
          const atStart = input.selectionStart === 0 && input.selectionEnd === 0;
          const atEnd = input.selectionStart === input.value.length;
          const allSelected = input.selectionStart === 0 && input.selectionEnd === input.value.length;
          if (e.key === 'Enter' && (e.shiftKey || e.altKey)) {
            e.preventDefault();
            commit();
            onDetails(row, col, input);
          } else if (e.key === 'Enter' || e.key === 'ArrowDown') {
            e.preventDefault();
            move(1, 0);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            move(-1, 0);
          } else if (e.key === 'ArrowLeft' && (atStart || allSelected)) {
            e.preventDefault();
            move(0, -1);
          } else if (e.key === 'ArrowRight' && (atEnd || allSelected)) {
            e.preventDefault();
            move(0, 1);
          } else if (e.key === 'Escape') {
            setText(display);
            input.blur();
          }
        }}
        className={`tabular h-9 w-full rounded-md border bg-transparent pr-6 pl-1.5 text-right text-sm transition-colors outline-none hover:border-line-strong focus:border-accent focus:bg-surface focus:ring-2 focus:ring-accent/25 ${
          invalid ? 'border-negative bg-negative-soft' : 'border-transparent'
        } ${display ? 'font-medium text-ink' : 'text-ink-muted'}`}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={`Kommentar og detaljer, ${label}`}
        title={hasComment ? entry?.comment || 'Detaljer' : 'Legg til kommentar'}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => onDetails(row, col, e.currentTarget.parentElement!.querySelector('input')!)}
        className={`absolute top-1/2 right-1 -translate-y-1/2 rounded p-0.5 transition-opacity ${
          hasComment
            ? 'text-accent opacity-100'
            : 'text-ink-subtle opacity-0 group-hover/cell:opacity-100 group-focus-within/cell:opacity-100'
        }`}
      >
        <Comment size={13} strokeWidth={hasComment ? 2.4 : 1.8} />
      </button>
    </div>
  );
});

export function TimeGrid({
  lines,
  days,
  dailyNorm,
  flexFor,
  onUpdate,
  onEditLine,
  onAddLine,
}: {
  lines: Line[];
  days: GridDay[];
  dailyNorm: number;
  /** Flex for a date given the day's total, or null when it should not be shown. */
  flexFor: (date: string, hours: number) => number | null;
  onUpdate: (fn: (lines: Line[]) => Line[]) => void;
  onEditLine: (line: Line) => void;
  onAddLine: () => void;
}) {
  const [details, setDetails] = useState<{ row: number; col: number; anchor: HTMLElement } | null>(null);

  const setHours = useCallback(
    (row: number, col: number, hours: number) => {
      const date = days[col]!.date;
      onUpdate((ls) => ls.map((l, i) => (i === row ? setEntry(l, date, { hours }) : l)));
    },
    [days, onUpdate],
  );

  const openDetails = useCallback(
    (row: number, col: number, anchor: HTMLElement) => setDetails({ row, col, anchor }),
    [],
  );

  const totals = days.map((d) =>
    round2(lines.reduce((sum, l) => sum + (entryFor(l, d.date)?.hours ?? 0), 0)),
  );
  const flex = days.map((d, i) => flexFor(d.date, totals[i]!));
  const weekTotal = round2(totals.reduce((a, b) => a + b, 0));
  const weekFlex = round2(flex.reduce<number>((a, b) => a + (b ?? 0), 0));

  const detailLine = details ? lines[details.row] : undefined;
  const detailDay = details ? days[details.col] : undefined;

  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-sm">
      <table className="w-full min-w-[860px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-xs text-ink-muted">
            <th className="sticky left-0 z-10 bg-surface px-3 py-2.5 text-left font-medium sm:px-4">
              Prosjekt / oppgave / type
            </th>
            {days.map((d) => (
              <th
                key={d.date}
                className={`w-[78px] px-1 py-2 text-center font-medium ${dayBg(d)}`}
                title={d.holiday}
              >
                <div className={d.isToday ? 'text-accent font-semibold' : d.isOff ? 'text-ink-subtle' : ''}>
                  {dayName(d.index)}
                </div>
                <div className={`tabular text-[11px] ${d.holiday ? 'text-negative' : 'text-ink-subtle'}`}>
                  {shortDate(d.date)}
                </div>
              </th>
            ))}
            <th className="w-[70px] px-3 py-2 text-right font-medium">Sum</th>
            <th className="w-[124px] px-2" aria-label="Handlinger" />
          </tr>
        </thead>
        <tbody>
          {lines.map((line, row) => {
            const total = lineTotal(line);
            return (
              <tr key={line.id} className="group border-b border-line last:border-b-0 hover:bg-subtle">
                <td className="sticky left-0 z-10 w-[150px] max-w-[150px] bg-surface px-1 py-1 group-hover:bg-subtle sm:w-auto sm:max-w-[340px] sm:px-2">
                  <button
                    type="button"
                    onClick={() => onEditLine(line)}
                    className="block w-full rounded-md px-2 py-1 text-left hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent"
                    title="Rediger linje"
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="truncate font-medium">
                        {line.projectName || line.projectNumber || 'Uten prosjekt'}
                      </span>
                      {line.projectName && line.projectNumber && (
                        <span className="tabular hidden shrink-0 text-xs text-ink-subtle sm:inline">{line.projectNumber}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-ink-muted">
                      <span className="truncate">{joinNumberName(line.taskNumber, line.taskName) || '–'}</span>
                      {line.type && (
                        <span
                          className={`hidden shrink-0 rounded px-1.5 py-px text-[10px] font-medium sm:inline ${
                            /^normal\b/i.test(line.type)
                              ? 'bg-subtle text-ink-subtle'
                              : 'bg-warning-soft text-warning'
                          }`}
                        >
                          {line.type}
                        </span>
                      )}
                    </div>
                  </button>
                </td>
                {days.map((d) => (
                  <td key={d.date} className={`px-1 py-1 ${dayBg(d)}`}>
                    <HourCell
                      entry={entryFor(line, d.date)}
                      row={row}
                      col={d.index}
                      rowCount={lines.length}
                      label={`${line.projectName || line.projectNumber} ${line.taskName}, ${dayName(d.index)} ${shortDate(d.date)}`}
                      onCommit={setHours}
                      onDetails={openDetails}
                    />
                  </td>
                ))}
                <td className="tabular px-3 py-1 text-right font-semibold">
                  {total > 0 ? formatHours(total) : <span className="font-normal text-ink-subtle">0</span>}
                </td>
                <td className="px-2 py-1">
                  <div className="flex justify-end gap-0.5 opacity-60 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    <IconButton
                      label="Flytt opp"
                      disabled={row === 0}
                      onClick={() => onUpdate((ls) => moveItem(ls, row, row - 1))}
                    >
                      <ArrowUp size={14} />
                    </IconButton>
                    <IconButton
                      label="Flytt ned"
                      disabled={row === lines.length - 1}
                      onClick={() => onUpdate((ls) => moveItem(ls, row, row + 1))}
                    >
                      <ArrowDown size={14} />
                    </IconButton>
                    <IconButton
                      label="Dupliser linje (uten timer)"
                      onClick={() =>
                        onUpdate((ls) => {
                          const next = [...ls];
                          next.splice(row + 1, 0, { ...line, id: crypto.randomUUID(), entries: [] });
                          return next;
                        })
                      }
                    >
                      <Copy size={14} />
                    </IconButton>
                    <IconButton
                      label="Slett linje"
                      className="hover:!text-negative"
                      onClick={() => {
                        if (total > 0 && !confirm(`Slette linjen med ${formatHours(total)} timer?`)) return;
                        onUpdate((ls) => ls.filter((l) => l.id !== line.id));
                      }}
                    >
                      <Trash size={14} />
                    </IconButton>
                  </div>
                </td>
              </tr>
            );
          })}
          <tr>
            <td colSpan={10} className="sticky left-0 px-3 py-2">
              <button
                type="button"
                onClick={onAddLine}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-accent hover:bg-accent-soft"
              >
                <Plus size={15} /> Legg til linje
              </button>
            </td>
          </tr>
        </tbody>
        <tfoot className="border-t-2 border-line-strong bg-subtle text-sm">
          <tr>
            <th scope="row" className="sticky left-0 z-10 bg-subtle px-4 py-2 text-left font-medium text-ink-muted">
              Sum per dag
            </th>
            {days.map((d, i) => {
              const total = totals[i]!;
              const over = total > normForDate(d.date, dailyNorm) && total > 0 && !d.isOff;
              return (
                <td
                  key={d.date}
                  className={`tabular px-2 py-2 text-right font-semibold ${over ? 'text-negative' : total ? '' : 'text-ink-subtle font-normal'}`}
                  title={over ? 'Over dagsnorm' : undefined}
                >
                  {formatHours(total)}
                </td>
              );
            })}
            <td className="tabular px-3 py-2 text-right font-bold">{formatHours(weekTotal)}</td>
            <td />
          </tr>
          <tr className="border-t border-line">
            <th scope="row" className="sticky left-0 z-10 bg-subtle px-4 py-2 text-left font-medium text-ink-muted">
              Fleks
            </th>
            {flex.map((f, i) => (
              <td key={days[i]!.date} className={`tabular px-2 py-2 text-right ${flexColor(f)}`}>
                {f === null ? '' : signedHours(f)}
              </td>
            ))}
            <td className={`tabular px-3 py-2 text-right font-semibold ${flexColor(weekFlex)}`}>
              {signedHours(weekFlex)}
            </td>
            <td />
          </tr>
        </tfoot>
      </table>

      {details && detailLine && detailDay && (
        <EntryPopover
          key={`${detailLine.id}:${detailDay.date}`}
          anchor={details.anchor}
          entry={entryFor(detailLine, detailDay.date) ?? emptyEntry(detailDay.date)}
          dayIndex={detailDay.index}
          title={`${detailLine.projectName} · ${joinNumberName(detailLine.taskNumber, detailLine.taskName)}`}
          onClose={() => setDetails(null)}
          onSave={(patch) => {
            const date = detailDay.date;
            const id = detailLine.id;
            onUpdate((ls) => ls.map((l) => (l.id === id ? setEntry(l, date, patch) : l)));
          }}
        />
      )}
    </div>
  );
}

function flexColor(value: number | null) {
  if (value === null || value === 0) return 'text-ink-subtle';
  return value > 0 ? 'text-positive' : 'text-negative';
}
