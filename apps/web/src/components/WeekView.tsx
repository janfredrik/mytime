import {
  type LineDescriptor,
  WEEK_STATUS_LABEL,
  type WeekStatus,
  addDays,
  dailyFlex,
  formatHours,
  hoursByDate,
  isoWeekOf,
  lineKey,
  normForDate,
  round2,
  weekDates,
} from '@mytime/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { dateTime, dayName, longDate, shortDate, signedHours } from '../lib/format';
import { newLine } from '../lib/lines';
import { useWeekEditor } from '../lib/useWeekEditor';
import { ImportDialog } from './ImportDialog';
import { LineEditor } from './LineEditor';
import { MiniCalendar } from './MiniCalendar';
import { TimeGrid, gridDays } from './TimeGrid';
import { Alert, Check, ChevronLeft, ChevronRight, Copy, Download, Plus, Send, Upload } from './icons';
import { Button, Spinner } from './ui';

const STATUS_STYLE: Record<WeekStatus, string> = {
  draft: 'bg-subtle text-ink-muted ring-line-strong',
  submitted: 'bg-positive-soft text-positive ring-positive/30',
  modified: 'bg-warning-soft text-warning ring-warning/30',
};

function StatCard({ label, children, footer }: { label: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-line bg-surface px-4 py-3 shadow-sm">
      <div className="text-xs font-medium text-ink-muted">{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">{children}</div>
      {footer && <div className="mt-auto pt-2 text-xs text-ink-subtle">{footer}</div>}
    </div>
  );
}

function SaveIndicator({ state, error }: { state: string; error: string | null }) {
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
  if (state === 'error')
    return (
      <span className="inline-flex items-center gap-1 text-xs text-negative" title={error ?? undefined}>
        <Alert size={13} /> Ikke lagret{error ? `: ${error}` : ''}
      </span>
    );
  return null;
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
  const [toast, setToast] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

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
  const overDays = days.filter((d) => (totals.get(d.date) ?? 0) > normForDate(d.date, dailyNorm) && !d.isOff);
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

  const submit = () =>
    action('submit', async () => {
      await editor.runAction(() => api.submitWeek(weekStart));
      setToast({ kind: 'ok', text: `Uke ${week} er sendt inn` });
    });

  const exportWeek = () =>
    action('export', async () => {
      await editor.flush();
      const a = document.createElement('a');
      a.href = api.exportUrl(weekStart);
      a.download = '';
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => void qc.invalidateQueries({ queryKey: ['week', weekStart] }), 1500);
    });

  const saveLine = (descriptor: LineDescriptor) => {
    if (editing?.id) {
      const id = editing.id;
      editor.update((ls) => ls.map((l) => (l.id === id ? { ...l, ...descriptor } : l)));
    } else {
      editor.update((ls) => [...ls, newLine(descriptor)]);
    }
  };

  const status = meta?.status ?? 'draft';

  return (
    <div className="space-y-5">
      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Forrige uke"
                onClick={() => onNavigate(addDays(weekStart, -7))}
                className="rounded-lg p-1.5 text-ink-muted hover:bg-hover hover:text-ink"
              >
                <ChevronLeft size={20} />
              </button>
              <h1 className="min-w-[6.5rem] text-center text-2xl font-semibold tracking-tight">Uke {week}</h1>
              <button
                type="button"
                aria-label="Neste uke"
                onClick={() => onNavigate(addDays(weekStart, 7))}
                className="rounded-lg p-1.5 text-ink-muted hover:bg-hover hover:text-ink"
              >
                <ChevronRight size={20} />
              </button>
            </div>
            <div className="text-sm text-ink-muted tabular">
              {dayName(0)} {shortDate(weekStart)} – {dayName(6).toLowerCase()} {longDate(addDays(weekStart, 6))}
            </div>
            {!dates.includes(today) && (
              <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => onNavigate(today)}>
                Gå til denne uka
              </Button>
            )}
            <span
              className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLE[status]}`}
            >
              {WEEK_STATUS_LABEL[status]}
            </span>
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
            </StatCard>
            <StatCard label="Fleks denne uka" footer={flexFrom ? 'Timer minus dagsnorm, frem til i dag' : 'Starter når du fører timer'}>
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
            <StatCard
              label="Status"
              footer={meta?.lastExportedAt ? `Eksportert ${dateTime(meta.lastExportedAt)}` : 'Ikke eksportert'}
            >
              <span className="truncate text-lg font-semibold">{WEEK_STATUS_LABEL[status]}</span>
              {meta?.submittedAt && (
                <span className="truncate text-xs text-ink-muted">{dateTime(meta.submittedAt)}</span>
              )}
            </StatCard>
          </div>
        </div>
        <MiniCalendar weekStart={weekStart} today={today} dailyNorm={dailyNorm} onSelectWeek={onNavigate} />
      </section>

      {overDays.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning">
          <Alert className="shrink-0" />
          Over dagsnorm ({formatHours(dailyNorm)} t):{' '}
          {overDays.map((d) => `${dayName(d.index).toLowerCase()} ${shortDate(d.date)}`).join(', ')}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={copyPrevious} disabled={!lines || busy !== null}>
          {busy === 'copy' ? <Spinner /> : <Copy />} Kopier fra forrige uke
        </Button>
        <Button onClick={() => setImporting(true)} disabled={!lines}>
          <Upload /> Importer
        </Button>
        <Button onClick={exportWeek} disabled={!lines || busy !== null}>
          <Download /> Eksporter
        </Button>
        <div className="ml-auto flex items-center gap-3">
          <SaveIndicator state={editor.saveState} error={editor.saveError} />
          <Button variant="primary" onClick={submit} disabled={!lines || busy !== null}>
            {busy === 'submit' ? <Spinner /> : <Send />} {status === 'draft' ? 'Send inn' : 'Send inn på nytt'}
          </Button>
        </div>
      </div>

      {editor.loadError ? (
        <div className="rounded-xl border border-line bg-surface p-8 text-center text-sm text-negative">
          Kunne ikke laste uka: {editor.loadError.message}
        </div>
      ) : !lines ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-line bg-surface p-12 text-sm text-ink-muted">
          <Spinner /> Laster…
        </div>
      ) : lines.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
          <h2 className="text-base font-semibold">Ingen linjer i uke {week}</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-muted">
            Legg til en linje for prosjekt og oppgave, kopier linjene fra forrige uke, eller importer en Excel-fil.
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
          />
          <p className="text-xs text-ink-subtle">
            Tips: Bruk piltastene og Enter for å flytte mellom cellene. Shift+Enter åpner kommentar for cellen. Endringer
            lagres automatisk.
          </p>
        </>
      )}

      <LineEditor
        open={editing !== null}
        initial={editingLine}
        suggestions={suggestions.data ?? []}
        existingKeys={existingKeys}
        onSave={saveLine}
        onDelete={
          editingLine ? () => editor.update((ls) => ls.filter((l) => l.id !== editingLine.id)) : undefined
        }
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
          role="status"
          className={`fixed right-4 bottom-4 z-50 flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg ${
            toast.kind === 'ok' ? 'bg-ink text-canvas' : 'bg-negative text-white'
          }`}
        >
          {toast.kind === 'ok' ? <Check /> : <Alert />} {toast.text}
        </div>
      )}
    </div>
  );
}
