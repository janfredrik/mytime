import { type ExportableWeek, MYTIME_COMMENT_MAX, WEEK_STATUS_LABEL, addDays, formatHours } from '@mytime/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { DELIVERY_METHODS, type DeliveryMethod } from '../lib/delivery';
import { dateTime, longDate, shortDate } from '../lib/format';
import { Alert, Check } from './icons';
import { Button, Dialog, Spinner } from './ui';

type RowResult = { kind: 'busy' } | { kind: 'ok'; text: string } | { kind: 'error'; text: string };

/** Weeks that still need to reach the official system, and are over. */
export function pendingWeeks(weeks: readonly ExportableWeek[], today: string): ExportableWeek[] {
  return weeks.filter((w) => w.status !== 'exported' && w.longComments === 0 && addDays(w.weekStart, 6) < today);
}

/**
 * Export several weeks in one go, one file per week (the official MyTime takes one week per
 * upload). Starts with the finished weeks that are not exported, or changed since.
 */
export function ExportWeeksDialog({
  open,
  today,
  currentWeek,
  onClose,
  onNavigate,
  beforeRun,
}: {
  open: boolean;
  today: string;
  currentWeek: string;
  /** Save pending edits first, so no file leaves out the latest hours. */
  beforeRun: () => Promise<void>;
  onClose: () => void;
  onNavigate: (weekStart: string) => void;
}) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['exportable'], queryFn: api.exportable, enabled: open });
  const method: DeliveryMethod = DELIVERY_METHODS[0]!;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showExported, setShowExported] = useState(false);
  const [results, setResults] = useState<Map<string, RowResult>>(new Map());
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const initialised = useRef(false);

  // Pick the default selection once per opening, when the list first arrives.
  useEffect(() => {
    if (!open) {
      initialised.current = false;
      return;
    }
    if (initialised.current || !query.data) return;
    initialised.current = true;
    setSelected(new Set(pendingWeeks(query.data, today).map((w) => w.weekStart)));
    setResults(new Map());
    setShowExported(false);
  }, [open, query.data, today]);

  const all = query.data ?? [];
  const exportedCount = all.filter((w) => w.status === 'exported').length;
  const visible = useMemo(
    () => all.filter((w) => showExported || w.status !== 'exported' || selected.has(w.weekStart) || results.has(w.weekStart)),
    [all, showExported, selected, results],
  );
  const selectable = visible.filter((w) => w.longComments === 0);
  const chosen = all.filter((w) => selected.has(w.weekStart) && w.longComments === 0);
  const finished = results.size > 0 && !running;
  const failed = [...results.values()].filter((r) => r.kind === 'error').length;
  const done = [...results.values()].filter((r) => r.kind === 'ok').length;
  const multiYear = new Set(all.map((w) => w.isoYear)).size > 1;

  const toggle = (weekStart: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(weekStart)) next.delete(weekStart);
      else next.add(weekStart);
      return next;
    });
  const allChecked = selectable.length > 0 && selectable.every((w) => selected.has(w.weekStart));
  const someChecked = selectable.some((w) => selected.has(w.weekStart));
  const toggleAll = () =>
    setSelected((s) => {
      const next = new Set(s);
      for (const w of selectable) {
        if (allChecked) next.delete(w.weekStart);
        else next.add(w.weekStart);
      }
      return next;
    });

  const run = async (queue: string[]) => {
    setRunning(true);
    setProgress({ done: 0, total: queue.length });
    // A retry keeps the rows that already went through.
    setResults((r) => {
      const next = new Map(r);
      for (const w of queue) next.delete(w);
      return next;
    });
    try {
      await beforeRun();
    } catch (err) {
      const text = err instanceof Error ? err.message : 'Kunne ikke lagre';
      setResults((r) => new Map([...r, ...queue.map((w) => [w, { kind: 'error', text }] as const)]));
      setRunning(false);
      return;
    }
    for (const [index, weekStart] of queue.entries()) {
      setProgress({ done: index, total: queue.length });
      setResults((r) => new Map(r).set(weekStart, { kind: 'busy' }));
      let result: RowResult;
      try {
        result = { kind: 'ok', text: await method.deliver(weekStart) };
      } catch (err) {
        result = { kind: 'error', text: err instanceof Error ? err.message : 'Eksporten feilet' };
      }
      setResults((r) => new Map(r).set(weekStart, result));
    }
    setRunning(false);
    setSelected(new Set());
    void qc.invalidateQueries({ queryKey: ['exportable'] });
    void qc.invalidateQueries({ queryKey: ['calendar'] });
    void qc.invalidateQueries({ queryKey: ['week'] });
  };

  const close = () => {
    if (!running) onClose();
  };

  const footer = finished ? (
    <>
      <span className="mr-auto self-center text-sm text-ink-muted">
        {failed === 0
          ? `${done} ${done === 1 ? 'fil' : 'filer'} lastet ned. Last dem opp i MyTime, én uke om gangen.`
          : `${done} av ${done + failed} lastet ned. ${failed} feilet.`}
      </span>
      {failed > 0 && (
        <Button
          onClick={() =>
            void run([...results].filter(([, r]) => r.kind === 'error').map(([weekStart]) => weekStart))
          }
        >
          Prøv {failed === 1 ? 'den' : `de ${failed}`} som feilet
        </Button>
      )}
      <Button variant="primary" onClick={close} data-autofocus>
        Ferdig
      </Button>
    </>
  ) : (
    <>
      <Button variant="ghost" onClick={close} disabled={running}>
        Avbryt
      </Button>
      <Button variant="primary" onClick={() => void run(chosen.map((w) => w.weekStart))} disabled={running || chosen.length === 0}>
        {running ? (
          <>
            <Spinner /> {method.progressLabel(progress.done, progress.total)}
          </>
        ) : chosen.length === 0 ? (
          'Velg uker'
        ) : (
          method.actionLabel(chosen.length)
        )}
      </Button>
    </>
  );

  return (
    <Dialog open={open} onClose={close} title="Eksporter flere uker" wide footer={footer}>
      <p className="mb-4 text-sm text-ink-muted">
        Hver uke blir en egen .xlsx-fil i samme format som når du eksporterer én uke. Nettleseren kan spørre om
        lov til å laste ned flere filer.
      </p>

      {query.isLoading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-ink-muted">
          <Spinner /> Henter uker…
        </div>
      ) : query.error ? (
        <div className="flex items-start gap-2 rounded-lg bg-negative-soft px-3 py-2 text-sm text-negative">
          <Alert className="mt-0.5 shrink-0" /> Kunne ikke hente ukene. {query.error.message}
        </div>
      ) : all.length === 0 ? (
        <p className="py-6 text-sm text-ink-muted">Du har ikke ført timer ennå.</p>
      ) : (
        <>
          {visible.length === 0 ? (
            <p className="py-4 text-sm text-ink-muted">
              <Check size={14} className="mr-1 inline text-positive" />
              Alle uker med timer er eksportert.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-muted">
                  <th className="w-8 py-2">
                    <input
                      type="checkbox"
                      aria-label="Velg alle"
                      checked={allChecked}
                      ref={(el) => {
                        if (el) el.indeterminate = someChecked && !allChecked;
                      }}
                      onChange={toggleAll}
                      disabled={running || finished || selectable.length === 0}
                      className="h-4 w-4 accent-accent"
                    />
                  </th>
                  <th className="py-2 font-medium">Uke</th>
                  <th className="py-2 text-right font-medium">Linjer</th>
                  <th className="py-2 text-right font-medium">Timer</th>
                  <th className="py-2 pl-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((w) => {
                  const result = results.get(w.weekStart);
                  const blocked = w.longComments > 0;
                  const id = `export-week-${w.weekStart}`;
                  return (
                    <tr key={w.weekStart} className="border-b border-line last:border-0">
                      <td className="py-2 align-top">
                        <input
                          id={id}
                          type="checkbox"
                          checked={!blocked && selected.has(w.weekStart)}
                          onChange={() => toggle(w.weekStart)}
                          disabled={blocked || running || finished}
                          className="mt-0.5 h-4 w-4 accent-accent"
                        />
                      </td>
                      <td className="py-2 align-top">
                        <label htmlFor={id} className={blocked ? '' : 'cursor-pointer'}>
                          <span className="font-medium">Uke {w.isoWeek}</span>{' '}
                          <span className="text-ink-subtle tabular">
                            {shortDate(w.weekStart)}–{multiYear ? longDate(addDays(w.weekStart, 6)) : shortDate(addDays(w.weekStart, 6))}
                          </span>
                        </label>
                      </td>
                      <td className="tabular py-2 text-right align-top">{w.lines}</td>
                      <td className="tabular py-2 text-right align-top font-medium">{formatHours(w.totalHours)}</td>
                      <td className="py-2 pl-4 align-top text-xs">
                        <RowStatus
                          week={w}
                          result={result}
                          today={today}
                          isCurrent={w.weekStart === currentWeek}
                          onOpen={() => {
                            onNavigate(w.weekStart);
                            onClose();
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {exportedCount > 0 && !running && !finished && (
            <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-ink-muted">
              <input
                type="checkbox"
                checked={showExported}
                onChange={(e) => setShowExported(e.target.checked)}
                className="h-4 w-4 accent-accent"
              />
              Vis {exportedCount === 1 ? 'uka' : `de ${exportedCount} ukene`} som allerede er eksportert
            </label>
          )}
        </>
      )}
    </Dialog>
  );
}

function RowStatus({
  week,
  result,
  today,
  isCurrent,
  onOpen,
}: {
  week: ExportableWeek;
  result: RowResult | undefined;
  today: string;
  isCurrent: boolean;
  onOpen: () => void;
}) {
  if (result?.kind === 'busy') {
    return (
      <span className="flex items-center gap-1.5 text-ink-muted">
        <Spinner className="h-3 w-3" /> Lager fil…
      </span>
    );
  }
  if (result?.kind === 'ok') {
    return (
      <span className="flex items-center gap-1.5 text-positive">
        <Check size={13} className="shrink-0" /> <span className="break-all">{result.text}</span>
      </span>
    );
  }
  if (result?.kind === 'error') {
    return (
      <span className="flex items-start gap-1.5 text-negative">
        <Alert size={13} className="mt-px shrink-0" /> {result.text}
      </span>
    );
  }
  if (week.longComments > 0) {
    return (
      <span className="text-negative">
        {week.longComments === 1 ? 'Én kommentar' : `${week.longComments} kommentarer`} over {MYTIME_COMMENT_MAX} tegn.{' '}
        {!isCurrent && (
          <button type="button" onClick={onOpen} className="font-medium underline underline-offset-2 hover:text-ink">
            Åpne uka
          </button>
        )}
      </span>
    );
  }
  const ongoing = addDays(week.weekStart, 6) >= today;
  const tone = week.status === 'changed' ? 'text-warning' : week.status === 'exported' ? 'text-positive' : 'text-ink-muted';
  return (
    <span className={tone}>
      {week.status === 'exported' && week.lastExportedAt
        ? `Eksportert ${dateTime(week.lastExportedAt)}`
        : WEEK_STATUS_LABEL[week.status]}
      {ongoing && <span className="text-ink-subtle"> · uka er ikke over</span>}
    </span>
  );
}
