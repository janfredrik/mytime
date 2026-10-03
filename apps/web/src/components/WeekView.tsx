import {
  type LineDescriptor,
  WEEK_STATUS_LABEL,
  type WeekStatus,
  addDays,
  dailyFlex,
  formatHours,
  hoursByDate,
  isoWeekOf,
  joinNumberName,
  lineKey,
  normForDate,
  round2,
  weekDates,
} from '@mytime/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { dateTime, dayName, longDate, shortDate, signedHours } from '../lib/format';
import { newLine } from '../lib/lines';
import { useCelebrate } from '../lib/useCelebrate';
import { type SaveErrorKind, type SaveState, useWeekEditor } from '../lib/useWeekEditor';
import { ImportDialog } from './ImportDialog';
import { LineEditor } from './LineEditor';
import { MiniCalendar } from './MiniCalendar';
import { TimeGrid, gridDays } from './TimeGrid';
import { Alert, Check, ChevronLeft, ChevronRight, Close, Copy, Download, Plus, Upload } from './icons';
import { Button, Spinner } from './ui';

const STATUS_TONE: Record<WeekStatus, string> = {
  draft: '',
  exported: 'text-positive',
  changed: 'text-warning',
};

const IS_MAC = typeof navigator !== 'undefined' && navigator.platform.startsWith('Mac');
const ALT = IS_MAC ? '⌥' : 'Alt';

interface Toast {
  kind: 'ok' | 'error';
  text: string;
  action?: { label: string; run: () => void };
}

function saveBlob({ blob, fileName }: { blob: Blob; fileName: string }) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function StatCard({ label, children, footer }: { label: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-line bg-surface px-4 py-3 shadow-sm">
      <div className="text-xs font-medium text-ink-muted">{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">{children}</div>
      {footer && <div className="mt-auto pt-2 text-xs text-ink-subtle">{footer}</div>}
    </div>
  );
}

function SaveIndicator({
  state,
  error,
  kind,
  onRetry,
}: {
  state: SaveState;
  error: string | null;
  kind: SaveErrorKind | null;
  onRetry: () => void;
}) {
  if (state === 'error' && kind === 'transient')
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-warning" title={error ?? undefined}>
        <Alert size={13} /> Ikke lagret ennå, prøver igjen
        <button type="button" onClick={onRetry} className="font-medium underline underline-offset-2 hover:text-ink">
          Prøv nå
        </button>
      </span>
    );
  // Sign-in and rejected data get the banner above the grid instead.
  if (state === 'error') return null;
  if (state === 'saving' || state === 'pending')
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-ink-subtle">
        <Spinner className="h-3 w-3" /> Lagrer…
      </span>
    );
  if (state === 'saved')
    return (
      <span className="inline-flex items-center gap-1 text-xs text-ink-subtle">
        <Check size={13} /> Lagret
      </span>
    );
  return null;
}

/** Problems a retry can't fix on its own: the user has to sign in again or change the data. */
function SaveBanner({ error, kind }: { error: string | null; kind: SaveErrorKind | null }) {
  if (kind !== 'auth' && kind !== 'rejected') return null;
  const returnTo = window.location.pathname + window.location.search;
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-negative/30 bg-negative-soft px-4 py-3 text-sm"
    >
      <Alert className="shrink-0 text-negative" />
      <p className="min-w-0 flex-1 text-ink">
        {kind === 'auth' ? (
          <>
            <span className="font-semibold">Økten er utløpt.</span> Endringene dine er tatt vare på i denne fanen og
            lagres når du har logget inn igjen.
          </>
        ) : (
          <>
            <span className="font-semibold">Endringene ble ikke lagret.</span> {error}
          </>
        )}
      </p>
      {kind === 'auth' && (
        <a
          href={`/auth/login?returnTo=${encodeURIComponent(returnTo)}`}
          className="inline-flex shrink-0 items-center rounded-lg bg-accent px-3 py-1.5 font-medium text-accent-ink hover:bg-accent-hover"
        >
          Logg inn igjen
        </a>
      )}
    </div>
  );
}

export function WeekView({
  weekStart,
  today,
  dailyNorm,
  flexStartDate,
  onNavigate,
}: {
  weekStart: string;
  today: string;
  dailyNorm: number;
  flexStartDate: string | null;
  onNavigate: (weekStart: string) => void;
}) {
  const qc = useQueryClient();
  const editor = useWeekEditor(weekStart);
  const { lines, meta } = editor;
  const flex = useQuery({ queryKey: ['flex'], queryFn: api.flex });
  const suggestions = useQuery({ queryKey: ['suggestions'], queryFn: api.suggestions });

  const [editing, setEditing] = useState<{ id: string | null } | null>(null);
  const [importing, setImporting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [toastPaused, setToastPaused] = useState(false);

  // Errors stay until dismissed; confirmations linger longer when they offer undo.
  useEffect(() => {
    if (!toast || toast.kind === 'error' || toastPaused) return;
    const t = setTimeout(() => setToast(null), toast.action ? 8000 : 5000);
    return () => clearTimeout(t);
  }, [toast, toastPaused]);

  const dates = useMemo(() => weekDates(weekStart), [weekStart]);
  const days = useMemo(() => gridDays(dates, today), [dates, today]);
  const { week } = isoWeekOf(weekStart);

  const totals = useMemo(() => hoursByDate(lines ?? []), [lines]);
  const weekTotal = round2([...totals.values()].reduce((a, b) => a + b, 0));
  const weekNorm = dates.reduce((s, d) => s + normForDate(d, dailyNorm), 0);
  // Flex only counts from the flex start date (same rule as the balance).
  const flexFrom = flexStartDate ?? flex.data?.startDate ?? null;
  const flexFor = useCallback(
    (date: string, hours: number) =>
      flexFrom && date >= flexFrom ? dailyFlex(date, hours, dailyNorm, today) : null,
    [flexFrom, dailyNorm, today],
  );
  const weekFlex = round2(dates.reduce((s, d) => s + (flexFor(d, totals.get(d) ?? 0) ?? 0), 0));
  const isCurrentWeek = dates.includes(today);
  const isFutureWeek = weekStart > today;
  const flexNote = !flexFrom
    ? 'Starter når du fører timer'
    : isFutureWeek
      ? 'Uka har ikke startet'
      : isCurrentWeek
        ? `Til nå. I dag teller fra ${formatHours(dailyNorm)} t`
        : 'Timer minus dagsnorm';
  const weekFull = weekNorm > 0 && weekTotal >= weekNorm;
  const weekFullState = useMemo(() => new Map([[weekStart, weekFull]]), [weekStart, weekFull]);
  const weekJustFull = useCelebrate(weekFullState).has(weekStart);
  const progress = weekNorm > 0 ? Math.min(100, (weekTotal / weekNorm) * 100) : 0;

  const existingKeys = useMemo(() => new Set((lines ?? []).map(lineKey)), [lines]);
  const editingLine = editing?.id ? lines?.find((l) => l.id === editing.id) ?? null : null;

  const action = async (name: string, fn: () => Promise<void>) => {
    setBusy(name);
    try {
      await fn();
    } catch (err) {
      setToast({ kind: 'error', text: err instanceof Error ? err.message : 'Noe gikk galt' });
    } finally {
      setBusy(null);
    }
  };

  const copyPrevious = () =>
    action('copy', async () => {
      const before = lines?.length ?? 0;
      const result = await editor.runAction(() => api.copyPrevious(weekStart));
      const added = result.lines.length - before;
      setToast({
        kind: 'ok',
        text: added > 0 ? `Kopierte ${added} linjer fra forrige uke` : 'Alle linjene fra forrige uke finnes allerede',
      });
    });

  const exportWeek = () =>
    action('export', async () => {
      const lineCount = lines?.length ?? 0;
      const hours = weekTotal;
      let fileName = '';
      await editor.runAction(async () => {
        const file = await api.exportWeek(weekStart);
        fileName = file.fileName;
        saveBlob(file);
        return api.week(weekStart);
      });
      setToast({
        kind: 'ok',
        text: `Lastet ned ${fileName} (${lineCount} ${lineCount === 1 ? 'linje' : 'linjer'}, ${formatHours(hours)} t). Last den opp i timesystemet.`,
      });
    });

  const deleteLine = (id: string) => {
    const index = lines?.findIndex((l) => l.id === id) ?? -1;
    const removed = lines?.[index];
    if (!removed) return;
    editor.update((ls) => ls.filter((l) => l.id !== id));
    const task = joinNumberName(removed.taskNumber, removed.taskName);
    const name = [removed.projectName || removed.projectNumber, task].filter(Boolean).join(' · ') || 'Linjen';
    setToast({
      kind: 'ok',
      text: `Slettet ${name}`,
      action: {
        label: 'Angre',
        run: () =>
          editor.update((ls) =>
            ls.some((l) => l.id === removed.id) ? ls : [...ls.slice(0, index), removed, ...ls.slice(index)],
          ),
      },
    });
  };

  // Week navigation and "new line" from the keyboard, unless a dialog has the focus.
  const shortcuts = useRef({ prev: () => {}, next: () => {}, add: () => {} });
  shortcuts.current = {
    prev: () => onNavigate(addDays(weekStart, -7)),
    next: () => onNavigate(addDays(weekStart, 7)),
    add: () => lines && setEditing({ id: null }),
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || document.querySelector('dialog[open], [role="dialog"]')) return;
      if (e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'PageUp' && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        shortcuts.current.prev();
      } else if (e.key === 'PageDown' && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        shortcuts.current.next();
      } else if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyN') {
        e.preventDefault();
        shortcuts.current.add();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const saveLine = (descriptor: LineDescriptor) => {
    if (editing?.id) {
      const id = editing.id;
      editor.update((ls) => ls.map((l) => (l.id === id ? { ...l, ...descriptor } : l)));
    } else {
      editor.update((ls) => [...ls, newLine(descriptor)]);
    }
  };

  const status = meta?.status ?? 'draft';
  const canExport = !!lines && lines.length > 0 && weekTotal > 0;
  const exportLabel =
    status === 'exported' ? 'Eksporter på nytt' : status === 'changed' ? `Eksporter uke ${week} på nytt` : `Eksporter uke ${week}`;
  const exportNote =
    status === 'exported' && meta?.lastExportedAt
      ? `${dateTime(meta.lastExportedAt)}. Endringer etter dette krever ny eksport`
      : status === 'changed' && meta?.lastExportedAt
        ? `Sist eksportert ${dateTime(meta.lastExportedAt)}. Filen er utdatert`
        : weekTotal > 0
          ? 'Eksporter og last opp i timesystemet'
          : 'Ingen timer å eksportere ennå';

  return (
    <div className="space-y-5">
      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Forrige uke"
                aria-keyshortcuts="PageUp"
                title="Forrige uke (Page Up)"
                onClick={() => onNavigate(addDays(weekStart, -7))}
                className="rounded-lg p-1.5 text-ink-muted hover:bg-hover hover:text-ink"
              >
                <ChevronLeft size={20} />
              </button>
              <h1 className="min-w-[6.5rem] text-center text-2xl font-semibold tracking-tight">Uke {week}</h1>
              <button
                type="button"
                aria-label="Neste uke"
                aria-keyshortcuts="PageDown"
                title="Neste uke (Page Down)"
                onClick={() => onNavigate(addDays(weekStart, 7))}
                className="rounded-lg p-1.5 text-ink-muted hover:bg-hover hover:text-ink"
              >
                <ChevronRight size={20} />
              </button>
            </div>
            <div className="text-sm text-ink-muted tabular">
              {dayName(0)} {shortDate(weekStart)} – {dayName(6).toLowerCase()} {longDate(addDays(weekStart, 6))}
            </div>
            {/* Always rendered so the header does not shift between weeks. */}
            <Button
              variant="ghost"
              className={`!px-2 !py-1 text-xs ${isCurrentWeek ? 'invisible' : ''}`}
              onClick={() => onNavigate(today)}
            >
              Gå til denne uka
            </Button>
          </div>

          <div className="grid flex-1 grid-cols-2 gap-3">
            <StatCard
              label="Ført denne uka"
              footer={
                <div className="h-1.5 overflow-hidden rounded-full bg-subtle" aria-hidden="true">
                  <div
                    className={`h-full rounded-full ${weekTotal >= weekNorm ? 'bg-positive' : 'bg-accent'}`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              }
            >
              <span className="text-3xl font-semibold tabular">{formatHours(weekTotal)}</span>
              <span className="text-sm text-ink-muted tabular">/ {formatHours(weekNorm)} t</span>
              {weekFull && (
                <span
                  className={`ml-auto inline-flex items-center gap-1 self-center rounded-full bg-positive-soft py-0.5 pr-2.5 pl-1.5 text-xs font-semibold text-positive ${
                    weekJustFull ? 'stamp-in' : ''
                  }`}
                >
                  <Check size={13} strokeWidth={2.8} /> Full uke
                </span>
              )}
            </StatCard>
            <StatCard label="Fleks denne uka" footer={flexNote}>
              <span
                className={`text-3xl font-semibold tabular ${weekFlex > 0 ? 'text-positive' : weekFlex < 0 ? 'text-negative' : ''}`}
              >
                {signedHours(weekFlex)}
              </span>
              <span className="text-sm text-ink-muted">t</span>
            </StatCard>
            <StatCard
              label="Fleksbalanse"
              footer={flex.data?.startDate ? `Fra ${longDate(flex.data.startDate)}` : 'Sett startsaldo i innstillinger'}
            >
              <span className="text-3xl font-semibold tabular">
                {flex.data ? formatHours(flex.data.balance) : '–'}
              </span>
              <span className="text-sm text-ink-muted">t</span>
            </StatCard>
            <StatCard label="Levering" footer={exportNote}>
              <span className={`flex min-w-0 items-start gap-1.5 text-lg leading-snug font-semibold ${STATUS_TONE[status]}`}>
                {status === 'exported' ? (
                  <Check className="mt-1 shrink-0" />
                ) : status === 'changed' ? (
                  <Alert className="mt-1 shrink-0" />
                ) : null}
                <span>{WEEK_STATUS_LABEL[status]}</span>
              </span>
            </StatCard>
          </div>
        </div>
        <MiniCalendar weekStart={weekStart} today={today} dailyNorm={dailyNorm} onSelectWeek={onNavigate} />
      </section>

      <div className="flex flex-wrap items-center gap-2">
        {lines && lines.length > 0 && (
          <>
            <Button onClick={copyPrevious} disabled={busy !== null}>
              {busy === 'copy' ? <Spinner /> : <Copy />} Kopier fra forrige uke
            </Button>
            <Button onClick={() => setImporting(true)}>
              <Upload /> Importer
            </Button>
          </>
        )}
        <div className="ml-auto flex items-center gap-3">
          <SaveIndicator
            state={editor.saveState}
            error={editor.saveError}
            kind={editor.saveErrorKind}
            onRetry={() => void editor.flush()}
          />
          <Button
            variant={status === 'exported' ? 'secondary' : 'primary'}
            onClick={exportWeek}
            disabled={!canExport || busy !== null}
            title={canExport ? undefined : 'Ingen timer å eksportere'}
          >
            {busy === 'export' ? <Spinner /> : <Download />} {exportLabel}
          </Button>
        </div>
      </div>

      <SaveBanner error={editor.saveError} kind={editor.saveErrorKind} />

      {editor.loadError ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-line bg-surface p-8 text-center text-sm">
          <p className="text-negative">Kunne ikke laste uka. {editor.loadError.message}</p>
          <Button onClick={() => void editor.reload()}>Prøv igjen</Button>
        </div>
      ) : !lines ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-line bg-surface p-12 text-sm text-ink-muted">
          <Spinner /> Laster…
        </div>
      ) : lines.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
          <h2 className="text-base font-semibold">Ingen linjer i uke {week}</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-muted">
            Legg til en linje for prosjekt og oppgave, kopier linjene fra forrige uke, eller importer en fil fra MyTime.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button variant="primary" onClick={() => setEditing({ id: null })}>
              <Plus /> Legg til linje
            </Button>
            <Button onClick={copyPrevious} disabled={busy !== null}>
              <Copy /> Kopier fra forrige uke
            </Button>
            <Button onClick={() => setImporting(true)}>
              <Upload /> Importer
            </Button>
          </div>
        </div>
      ) : (
        <>
          <TimeGrid
            lines={lines}
            days={days}
            dailyNorm={dailyNorm}
            flexFor={flexFor}
            onUpdate={editor.update}
            onEditLine={(l) => setEditing({ id: l.id })}
            onAddLine={() => setEditing({ id: null })}
            onDeleteLine={deleteLine}
          />
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
            <span>
              <kbd>←</kbd> <kbd>→</kbd> <kbd>↑</kbd> <kbd>↓</kbd> <kbd>Enter</kbd> flytter mellom cellene
            </span>
            <span>
              <kbd>Shift</kbd>+<kbd>Enter</kbd> kommentar
            </span>
            <span>
              <kbd>Esc</kbd> angrer i cellen
            </span>
            <span>
              <kbd>{ALT}</kbd>+<kbd>N</kbd> ny linje
            </span>
          </p>
        </>
      )}

      <LineEditor
        open={editing !== null}
        initial={editingLine}
        suggestions={suggestions.data ?? []}
        existingKeys={existingKeys}
        onSave={saveLine}
        onDelete={editingLine ? () => deleteLine(editingLine.id) : undefined}
        onClose={() => setEditing(null)}
      />

      <ImportDialog
        open={importing}
        weekStart={weekStart}
        onClose={() => setImporting(false)}
        beforeCommit={editor.flush}
        onImported={(weeks) => {
          void qc.invalidateQueries({ queryKey: ['week'] });
          void qc.invalidateQueries({ queryKey: ['calendar'] });
          void qc.invalidateQueries({ queryKey: ['flex'] });
          void qc.invalidateQueries({ queryKey: ['suggestions'] });
          if (weeks.includes(weekStart)) void editor.reload();
          else if (weeks[0]) onNavigate(weeks[0]);
          setToast({ kind: 'ok', text: `Importerte ${weeks.length === 1 ? 'uke ' + isoWeekOf(weeks[0]!).week : weeks.length + ' uker'}` });
        }}
      />

      {toast && (
        <div
          role={toast.kind === 'error' ? 'alert' : 'status'}
          onMouseEnter={() => setToastPaused(true)}
          onMouseLeave={() => setToastPaused(false)}
          onFocus={() => setToastPaused(true)}
          onBlur={() => setToastPaused(false)}
          className={`fixed right-4 bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg py-2 pr-2 pl-4 text-sm font-medium shadow-lg sm:left-auto sm:max-w-md ${
            toast.kind === 'ok' ? 'bg-ink text-canvas' : 'bg-negative text-negative-ink'
          }`}
        >
          <span className="shrink-0">{toast.kind === 'ok' ? <Check /> : <Alert />}</span>
          <span className="min-w-0 flex-1">{toast.text}</span>
          {toast.action && (
            <button
              type="button"
              onClick={() => {
                toast.action!.run();
                setToast(null);
              }}
              className="shrink-0 rounded-md px-2.5 py-1 font-semibold underline-offset-2 hover:underline"
            >
              {toast.action.label}
            </button>
          )}
          <button
            type="button"
            aria-label="Lukk melding"
            onClick={() => setToast(null)}
            className="shrink-0 rounded-md p-1 opacity-80 hover:opacity-100"
          >
            <Close size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
