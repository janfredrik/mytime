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
import { type CSSProperties, type DragEvent, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDensity } from '../lib/density';
import { dayName, shortDate, signedHours } from '../lib/format';
import { emptyEntry, entryFor, moveItem, setEntry } from '../lib/lines';
import { useCelebrate } from '../lib/useCelebrate';
import { EntryPopover } from './EntryPopover';
import { Check, Comment, Copy, Grip, Plus, Trash } from './icons';
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

/**
 * How the line label is laid out. Wide: project, task and type columns. Medium: project and task,
 * with unusual types after the task. Narrow (phones): one column with the task under the project,
 * so the hours stay in view.
 */
type LabelLayout = 'wide' | 'medium' | 'narrow';

const WIDE = '(min-width: 1280px)';
const MEDIUM = '(min-width: 640px)';

function currentLayout(): LabelLayout {
  if (window.matchMedia(WIDE).matches) return 'wide';
  return window.matchMedia(MEDIUM).matches ? 'medium' : 'narrow';
}

function useLabelLayout() {
  const [layout, setLayout] = useState(currentLayout);
  useEffect(() => {
    const queries = [WIDE, MEDIUM].map((q) => window.matchMedia(q));
    const onChange = () => setLayout(currentLayout());
    queries.forEach((mq) => mq.addEventListener('change', onChange));
    return () => queries.forEach((mq) => mq.removeEventListener('change', onChange));
  }, []);
  return layout;
}

/** Normal hours are the default; in the narrow layout only other types are worth the room. */
const isDefaultType = (type: string) => /^normal\b/i.test(type);

/**
 * Day headers that follow the page on phones. The grid scrolls sideways in its own box, which keeps
 * `position: sticky` from reaching the page, so a copy is shown while the real header is out of view.
 */
function useFloatingHead(enabled: boolean) {
  const headRef = useRef<HTMLTableSectionElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const cloneRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  const syncScroll = useCallback(() => {
    if (cloneRef.current && scrollRef.current) cloneRef.current.scrollLeft = scrollRef.current.scrollLeft;
  }, []);

  useEffect(() => {
    if (!enabled) {
      setVisible(false);
      return;
    }
    const update = () => {
      const head = headRef.current?.getBoundingClientRect();
      const grid = scrollRef.current?.getBoundingClientRect();
      if (!head || !grid) return;
      // Show it from when the real header leaves until the grid's last rows pass under it.
      setVisible(head.top < 0 && grid.bottom > head.height * 2);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [enabled]);

  useEffect(() => {
    if (visible) syncScroll();
  }, [visible, syncScroll]);

  return { headRef, scrollRef, cloneRef, visible, syncScroll };
}

function focusCell(row: number, col: number) {
  const el = document.querySelector<HTMLInputElement>(`[data-cell="${row}:${col}"]`);
  el?.focus();
}

interface HourCellProps {
  entry: Entry | undefined;
  comfortable: boolean;
  row: number;
  col: number;
  rowCount: number;
  label: string;
  onCommit: (row: number, col: number, hours: number) => void;
  onDetails: (row: number, col: number, anchor: HTMLElement) => void;
}

const HourCell = memo(function HourCell({
  entry,
  comfortable,
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

  const parsed = parseHours(text);
  const isValid = text.trim() === '' || (parsed !== null && parsed >= 0 && parsed <= 24);

  /** Save the cell. Returns false (and flags the cell) when the text is not a valid number of hours. */
  const commit = () => {
    if (!isValid) {
      setInvalid(true);
      return false;
    }
    setInvalid(false);
    const hours = round2(parsed ?? 0);
    if (hours !== (entry?.hours ?? 0)) onCommit(row, col, hours);
    return true;
  };

  const move = (dRow: number, dCol: number) => {
    // Stay on an invalid cell so the value can be corrected.
    if (!commit()) return;
    const r = row + dRow;
    const c = col + dCol;
    if (r >= 0 && r < rowCount && c >= 0 && c < 7) focusCell(r, c);
  };

  const hasComment = !!entry && (entry.comment !== '' || entry.timeFrom !== '' || entry.timeTo !== '');
  const errorId = `cell-error-${row}-${col}`;

  return (
    <div className="group/cell relative">
      <input
        data-cell={`${row}:${col}`}
        inputMode="decimal"
        autoComplete="off"
        aria-label={hasComment ? `${label}, har kommentar` : label}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? errorId : undefined}
        title={entry?.comment || undefined}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (invalid) setInvalid(false);
        }}
        onFocus={(e) => {
          setFocused(true);
          e.currentTarget.select();
        }}
        onBlur={() => {
          setFocused(false);
          // Leaving with an invalid value restores the saved one; the message stays briefly.
          if (!commit()) {
            setText(display);
            setTimeout(() => setInvalid(false), 4000);
          }
        }}
        onKeyDown={(e) => {
          const input = e.currentTarget;
          const atStart = input.selectionStart === 0 && input.selectionEnd === 0;
          const atEnd = input.selectionStart === input.value.length;
          const allSelected = input.selectionStart === 0 && input.selectionEnd === input.value.length;
          if (e.key === 'Enter' && (e.shiftKey || e.altKey)) {
            e.preventDefault();
            if (commit()) onDetails(row, col, input);
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
            // Undo the typing but keep the place in the grid.
            setText(display);
            setInvalid(false);
            requestAnimationFrame(() => input.select());
          }
        }}
        className={`tabular ${comfortable ? 'h-9' : 'h-8'} w-full rounded-md border bg-transparent pr-6 pl-1.5 text-right text-sm transition-colors outline-none hover:border-line-strong focus:border-accent focus:bg-surface focus:ring-2 focus:ring-accent/25 ${
          invalid ? 'border-negative bg-negative-soft focus:border-negative focus:ring-negative/25' : 'border-transparent'
        } ${display ? 'font-medium text-ink' : 'text-ink-muted'}`}
      />
      {invalid && (
        <span
          id={errorId}
          role="alert"
          className="absolute top-full right-0 z-20 mt-1 rounded-md whitespace-nowrap bg-negative px-2 py-1 text-xs font-medium text-negative-ink shadow-md"
        >
          Ugyldige timer. Skriv 0–24, f.eks. 7,5
        </span>
      )}
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
  onDeleteLine,
}: {
  lines: Line[];
  days: GridDay[];
  dailyNorm: number;
  /** Flex for a date given the day's total, or null when it should not be shown. */
  flexFor: (date: string, hours: number) => number | null;
  onUpdate: (fn: (lines: Line[]) => Line[]) => void;
  onEditLine: (line: Line) => void;
  onAddLine: () => void;
  /** Remove a line (the caller offers undo). */
  onDeleteLine: (id: string) => void;
}) {
  const [details, setDetails] = useState<{ row: number; col: number; anchor: HTMLElement } | null>(null);
  const layout = useLabelLayout();
  const wide = layout === 'wide';
  const narrow = layout === 'narrow';
  const [density] = useDensity();
  const comfortable = density === 'comfortable';
  /** One label column: always on phones, and in the comfortable density with project above task. */
  const stacked = narrow || comfortable;
  const labelCols = stacked ? 1 : wide ? 3 : 2;
  const floatingHead = useFloatingHead(narrow);
  /** Fills the label columns after the sticky first one in the add and footer rows. */
  const labelRest = labelCols > 1 ? <td colSpan={labelCols - 1} /> : null;
  const [dragId, setDragId] = useState<string | null>(null);
  /** Insertion point while dragging: the line is dropped before this index. */
  const [dropAt, setDropAt] = useState<number | null>(null);

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

  // A workday is full once it reaches the norm; days off never need hours.
  const totalsKey = totals.join();
  const fullDays = useMemo(
    () =>
      new Map(
        days.map((d, i) => {
          const norm = normForDate(d.date, dailyNorm);
          return [d.date, norm > 0 && Number(totalsKey.split(',')[i]) >= norm] as const;
        }),
      ),
    [days, dailyNorm, totalsKey],
  );
  const justFull = useCelebrate(fullDays);
  const announcement = days
    .filter((d) => justFull.has(d.date))
    .map((d) => `${dayName(d.index)} ${shortDate(d.date)} er ført fullt`)
    .join('. ');

  const move = (from: number, to: number) => {
    if (to === from || to < 0 || to >= lines.length) return;
    onUpdate((ls) => moveItem(ls, from, to));
  };

  const onRowDragOver = (e: DragEvent<HTMLTableRowElement>, row: number) => {
    if (!dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    setDropAt(e.clientY < rect.top + rect.height / 2 ? row : row + 1);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const from = lines.findIndex((l) => l.id === dragId);
    if (from >= 0 && dropAt !== null) move(from, dropAt > from ? dropAt - 1 : dropAt);
    setDragId(null);
    setDropAt(null);
  };
  const weekFlex = round2(flex.reduce<number>((a, b) => a + (b ?? 0), 0));

  const detailLine = details ? lines[details.row] : undefined;
  const detailDay = details ? days[details.col] : undefined;
  const tableClass = `w-full ${narrow ? 'min-w-[810px]' : 'min-w-[960px]'} table-fixed border-collapse text-sm`;

  const headRow = (
    <tr className="border-b border-line text-xs text-ink-muted">
      <th
        scope="col"
        className={`sticky left-0 z-10 bg-surface py-2.5 pr-2 pl-8 text-left font-medium ${narrow ? 'w-[160px]' : ''}`}
      >
        {comfortable && !narrow ? 'Prosjekt / oppgave / type' : stacked ? 'Prosjekt / oppgave' : 'Prosjekt'}
      </th>
      {!stacked && (
        <th scope="col" className={`${wide ? '' : 'w-[150px]'} px-2 py-2.5 text-left font-medium`}>
          Oppgave
        </th>
      )}
      {wide && !stacked && (
        <th scope="col" className="w-[120px] px-2 py-2.5 text-left font-medium">
          Type
        </th>
      )}
      {days.map((d) => (
        <th
          key={d.date}
          scope="col"
          className={`w-[72px] px-1 py-2 text-center font-medium ${dayBg(d)}`}
          title={d.holiday}
        >
          <div
            className={`inline-flex items-center gap-1 ${d.isToday ? 'text-accent font-semibold' : d.isOff ? 'text-ink-subtle' : ''}`}
          >
            {dayName(d.index)}
            {fullDays.get(d.date) && (
              <>
                <Check size={12} strokeWidth={2.6} className="text-positive" />
                <span className="sr-only">, ført fullt</span>
              </>
            )}
          </div>
          <div className={`tabular text-xs ${d.holiday ? 'text-negative' : 'text-ink-subtle'}`}>
            {shortDate(d.date)}
          </div>
          {d.holiday && <span className="sr-only">{d.holiday}</span>}
        </th>
      ))}
      <th scope="col" className="w-[70px] px-3 py-2 text-right font-medium">
        Sum
      </th>
      <th scope="col" className="w-[76px] px-2">
        <span className="sr-only">Handlinger</span>
      </th>
    </tr>
  );

  return (
    <div className="relative rounded-xl border border-line bg-surface shadow-sm">
      {narrow && (
        // A copy of the day headers that stays at the top of the screen once the real ones scroll away.
        <div className="sticky top-0 z-30 h-0" aria-hidden="true">
          <div
            ref={floatingHead.cloneRef}
            className={`absolute inset-x-0 top-0 overflow-hidden bg-surface shadow-[0_1px_0_var(--color-line),0_4px_8px_-4px_rgb(0_0_0/0.15)] ${
              floatingHead.visible ? '' : 'invisible'
            }`}
          >
            <table className={tableClass}>
              <thead>{headRow}</thead>
            </table>
          </div>
        </div>
      )}
      <div ref={floatingHead.scrollRef} onScroll={floatingHead.syncScroll} className="relative overflow-x-auto rounded-xl">
        <div className="sr-only" aria-live="polite">
          {announcement}
        </div>
        <table className={tableClass}>
          <thead ref={floatingHead.headRef}>
            {headRow}
          </thead>
          <tbody
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropAt(null);
            }}
          >
            {lines.map((line, row) => {
              const total = lineTotal(line);
              return (
                <tr
                  key={line.id}
                  onDragOver={(e) => onRowDragOver(e, row)}
                  onDrop={onDrop}
                  className={`group border-b border-line last:border-b-0 hover:bg-subtle ${
                    dragId === line.id ? 'opacity-40' : ''
                  } ${dragId && dropAt === row ? 'shadow-[inset_0_2px_0_var(--color-accent)]' : ''} ${
                    dragId && dropAt === row + 1 && row === lines.length - 1
                      ? 'shadow-[inset_0_-2px_0_var(--color-accent)]'
                      : ''
                  }`}
                >
                  <td
                    className={`sticky left-0 z-10 bg-surface pr-1 group-hover:bg-subtle ${
                      narrow && comfortable ? 'py-2' : 'py-1'
                    }`}
                  >
                    <div className="flex items-center">
                      <button
                        type="button"
                        draggable
                        data-handle={line.id}
                        aria-label={`Flytt ${line.projectName || line.projectNumber} ${line.taskName}. Dra, eller bruk pil opp og ned`}
                        title="Dra for å flytte (eller pil opp/ned)"
                        onDragStart={(e) => {
                          const tr = e.currentTarget.closest('tr')!;
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', line.id);
                          e.dataTransfer.setDragImage(tr, 24, tr.offsetHeight / 2);
                          setDragId(line.id);
                        }}
                        onDragEnd={() => {
                          setDragId(null);
                          setDropAt(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
                          e.preventDefault();
                          move(row, row + (e.key === 'ArrowUp' ? -1 : 1));
                          requestAnimationFrame(() =>
                            document.querySelector<HTMLElement>(`[data-handle="${line.id}"]`)?.focus(),
                          );
                        }}
                        className={`flex ${comfortable ? 'h-9' : 'h-8'} w-6 shrink-0 cursor-grab items-center justify-center rounded text-ink-subtle opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 active:cursor-grabbing [@media(hover:none)]:opacity-100`}
                      >
                        <Grip size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onEditLine(line)}
                        className={`min-w-0 flex-1 rounded-md px-2 py-1 text-left hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent ${
                          stacked ? 'block' : 'flex items-baseline gap-2'
                        }`}
                        title={`Rediger linje: ${joinNumberName(line.projectNumber, line.projectName)}`}
                      >
                        {comfortable ? (
                          <>
                            <span className={`flex items-baseline ${narrow ? 'gap-1.5' : 'gap-2'}`}>
                              <span className="min-w-0 truncate font-medium">
                                {line.projectName || line.projectNumber || 'Uten prosjekt'}
                              </span>
                              {line.projectName && line.projectNumber && (
                                <span className="tabular shrink-0 text-xs text-ink-subtle">{line.projectNumber}</span>
                              )}
                            </span>
                            <span className="flex items-center gap-1.5 text-xs text-ink-muted">
                              <span className="truncate">{joinNumberName(line.taskNumber, line.taskName) || '–'}</span>
                              {line.type && !narrow && (
                                <span className="shrink-0 rounded bg-subtle px-1.5 py-px text-[11px] font-medium text-ink-subtle ring-1 ring-line ring-inset">
                                  {line.type}
                                </span>
                              )}
                            </span>
                            {/* Phones have no room beside the task, so the type gets its own line. */}
                            {line.type && narrow && (
                              <span className="mt-1 block truncate">
                                <span className="rounded bg-subtle px-1.5 py-px text-[11px] font-medium text-ink-subtle ring-1 ring-line ring-inset">
                                  {line.type}
                                </span>
                              </span>
                            )}
                          </>
                        ) : (
                          <>
                            <span className={`truncate font-medium ${narrow ? 'block' : ''}`}>
                              {line.projectName || line.projectNumber || 'Uten prosjekt'}
                            </span>
                            {wide && line.projectName && line.projectNumber && (
                              <span className="tabular shrink-0 text-xs text-ink-subtle">{line.projectNumber}</span>
                            )}
                            {narrow && (
                              <span className="block truncate text-xs text-ink-muted">
                                {joinNumberName(line.taskNumber, line.taskName) || '–'}
                                {line.type && !isDefaultType(line.type) && (
                                  <span className="text-ink-subtle"> · {line.type}</span>
                                )}
                              </span>
                            )}
                          </>
                        )}
                      </button>
                    </div>
                  </td>
                  {/* Task and type open the editor too; the project button is the keyboard entry point. */}
                  {!stacked && (
                    <td
                      className="cursor-pointer px-2 py-1 text-ink-muted"
                      onClick={() => onEditLine(line)}
                      title={[joinNumberName(line.taskNumber, line.taskName), line.type].filter(Boolean).join(' · ')}
                    >
                      <div className="flex items-baseline gap-1.5">
                        <span className="min-w-0 truncate">{joinNumberName(line.taskNumber, line.taskName) || '–'}</span>
                        {!wide && line.type && !isDefaultType(line.type) && (
                          <span className="min-w-0 shrink-[3] truncate text-xs text-ink-subtle">· {line.type}</span>
                        )}
                      </div>
                    </td>
                  )}
                  {wide && !stacked && (
                    <td className="cursor-pointer px-2 py-1 text-xs text-ink-subtle" onClick={() => onEditLine(line)}>
                      <div className="truncate">{line.type}</div>
                    </td>
                  )}
                  {days.map((d) => (
                    <td
                      key={d.date}
                      className={`px-1 py-1 ${dayBg(d)} ${justFull.has(d.date) ? 'column-wash' : ''}`}
                      style={justFull.has(d.date) ? ({ '--row': row } as CSSProperties) : undefined}
                    >
                      <HourCell
                        entry={entryFor(line, d.date)}
                        comfortable={comfortable}
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
                    <div className="flex justify-end gap-0.5 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:hover)]:opacity-0">
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
                        onClick={() => onDeleteLine(line.id)}
                      >
                        <Trash size={14} />
                      </IconButton>
                    </div>
                  </td>
                </tr>
              );
            })}
            <tr>
              {/* Only the first column is sticky, so the button stays put without covering the days. */}
              <td className="sticky left-0 z-10 bg-surface py-2 pr-1 pl-2">
                <button
                  type="button"
                  onClick={onAddLine}
                  aria-keyshortcuts="Alt+N"
                  className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1.5 text-sm font-medium whitespace-nowrap text-accent hover:bg-accent-soft"
                >
                  <Plus size={15} /> Legg til linje
                  <kbd className="ml-1 hidden sm:inline-block">{altKey} N</kbd>
                </button>
              </td>
              <td colSpan={labelCols - 1 + 9} />
            </tr>
          </tbody>
          <tfoot className="border-t-2 border-line-strong bg-subtle text-sm">
            <tr>
              <th scope="row" className="sticky left-0 z-10 bg-subtle py-2 pr-2 pl-8 text-left font-medium text-ink-muted">
                Sum per dag
              </th>
              {labelRest}
              {days.map((d, i) => {
                const total = totals[i]!;
                const full = fullDays.get(d.date);
                const celebrating = justFull.has(d.date);
                return (
                  <td
                    key={d.date}
                    className={`tabular px-2 py-2 text-right font-semibold ${total ? '' : 'text-ink-subtle font-normal'} ${
                      celebrating ? 'column-wash' : ''
                    }`}
                    style={celebrating ? ({ '--row': lines.length + 1 } as CSSProperties) : undefined}
                    title={full ? 'Ført fullt' : undefined}
                  >
                    {full ? (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full bg-positive-soft py-0.5 pr-2 pl-1.5 text-positive ${
                          celebrating ? 'stamp-in' : ''
                        }`}
                      >
                        <Check size={12} strokeWidth={2.8} />
                        {formatHours(total)}
                      </span>
                    ) : (
                      formatHours(total)
                    )}
                  </td>
                );
              })}
              <td className="tabular px-3 py-2 text-right font-bold">{formatHours(weekTotal)}</td>
              <td />
            </tr>
            <tr className="border-t border-line">
              <th scope="row" className="sticky left-0 z-10 bg-subtle py-2 pr-2 pl-8 text-left font-medium text-ink-muted">
                Fleks
              </th>
              {labelRest}
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
      </div>

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

const altKey = typeof navigator !== 'undefined' && navigator.platform.startsWith('Mac') ? '⌥' : 'Alt';

function flexColor(value: number | null) {
  if (value === null || value === 0) return 'text-ink-subtle';
  return value > 0 ? 'text-positive' : 'text-negative';
}
