import { type CatalogUploadResult, type ShareCandidate, type ShareCodes, joinNumberName } from '@mytime/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../lib/api';
import { Search } from './icons';
import { Button, Dialog, Spinner, inputClass } from './ui';

const taskKey = (project: string, task: string) => `${project}\u001f${task}`;

const people = (n: number) => (n === 1 ? '1 person' : `${n.toLocaleString('nb-NO')} personer`);

/** Every code the candidates offer, as selection keys: the project number, or project + task. */
function allKeys(candidates: readonly ShareCandidate[]): Set<string> {
  const keys = new Set<string>();
  for (const p of candidates) {
    if (!p.available) keys.add(p.number);
    for (const t of p.tasks) keys.add(taskKey(p.number, t.number));
  }
  return keys;
}

/**
 * Admin only: review the time codes in use that nobody can pick yet, and share the ones ticked.
 * Everything starts ticked; untick typos and old codes before sharing.
 */
export function ShareCodesDialog({
  open,
  onClose,
  onShared,
}: {
  open: boolean;
  onClose: () => void;
  onShared: (result: CatalogUploadResult) => void;
}) {
  const qc = useQueryClient();
  const candidates = useQuery({
    queryKey: ['catalog', 'share-candidates'],
    queryFn: api.shareCandidates,
    enabled: open,
    staleTime: 0,
    // A refetch resets the ticks; only fetch again when the dialog opens.
    refetchOnWindowFocus: false,
  });
  const list = useMemo(() => candidates.data ?? [], [candidates.data]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setFilter('');
      setError(null);
    }
  }, [open]);
  useEffect(() => {
    if (open) setSelected(allKeys(list));
  }, [open, list]);

  const shown = useMemo(() => {
    const terms = filter.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return list;
    const hit = (text: string) => terms.every((t) => text.toLowerCase().includes(t));
    return list.flatMap((p) => {
      if (hit(`${p.number} ${p.name}`)) return [p];
      const tasks = p.tasks.filter((t) => hit(`${p.number} ${p.name} ${t.number} ${t.name}`));
      return tasks.length > 0 ? [{ ...p, tasks }] : [];
    });
  }, [filter, list]);

  const toggle = (keys: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (on) next.add(k);
        else next.delete(k);
      }
      return next;
    });

  const toggleProject = (p: ShareCandidate, on: boolean) =>
    // Without its project a task has nowhere to go, so the tasks follow the project.
    toggle([p.number, ...p.tasks.map((t) => taskKey(p.number, t.number))], on);

  const toggleTask = (p: ShareCandidate, task: string, on: boolean) =>
    toggle(on && !p.available ? [p.number, taskKey(p.number, task)] : [taskKey(p.number, task)], on);

  const shownKeys = [...allKeys(shown)];
  const allShownSelected = shownKeys.length > 0 && shownKeys.every((k) => selected.has(k));

  const request: ShareCodes['projects'] = list.flatMap((p) => {
    const tasks = p.tasks.filter((t) => selected.has(taskKey(p.number, t.number)));
    const project = !p.available && selected.has(p.number);
    if (!project && tasks.length === 0) return [];
    return [{ number: p.number, name: p.name, tasks: tasks.map((t) => ({ number: t.number, name: t.name })) }];
  });

  const share = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.shareCodes({ projects: request });
      await qc.invalidateQueries({ queryKey: ['catalog'] });
      onShared(res);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delingen feilet');
    } finally {
      setBusy(false);
    }
  };

  const checkbox = 'h-4 w-4 shrink-0 accent-[var(--color-accent)]';

  // Portal: the settings dialog wraps its fields in a form, and Enter in the filter would submit it.
  return createPortal(
    <Dialog
      open={open}
      onClose={onClose}
      title="Del timekoder i bruk"
      wide
      footer={
        <>
          {error && <p className="mr-auto self-center text-sm text-negative">{error}</p>}
          <Button variant="ghost" onClick={onClose}>
            Avbryt
          </Button>
          <Button variant="primary" onClick={() => void share()} disabled={busy || request.length === 0}>
            {busy && <Spinner />} Del valgte
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-ink-muted">
        Disse kodene står i noens timeliste, men finnes ikke i katalogen. De du krysser av blir synlige for alle i
        prosjektvelgeren. Det vises ikke hvem som har brukt dem.
      </p>
      {candidates.isPending ? (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Spinner /> Henter timekoder…
        </p>
      ) : candidates.isError ? (
        <p className="text-sm text-negative">{candidates.error.message}</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-ink-muted">Ingen nye timekoder å dele. Alle som er i bruk finnes allerede.</p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search
                size={15}
                className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-subtle"
              />
              <input
                className={`${inputClass} pl-8`}
                placeholder="Filtrer på nummer eller navn…"
                aria-label="Filtrer timekoder"
                value={filter}
                data-autofocus
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
            <label className="flex shrink-0 items-center gap-2 text-sm text-ink-muted">
              <input
                type="checkbox"
                className={checkbox}
                checked={allShownSelected}
                onChange={(e) => toggle(shownKeys, e.target.checked)}
              />
              Velg alle{filter.trim() ? ' viste' : ''}
            </label>
          </div>
          <ul className="divide-y divide-line rounded-lg border border-line">
            {shown.map((p) => (
              <li key={p.number} className="px-3 py-2">
                {p.available ? (
                  <div className="flex items-baseline gap-2 text-sm">
                    <span className="tabular text-xs text-ink-subtle">{p.number}</span>
                    <span className="truncate font-medium">{p.name}</span>
                    <span className="ml-auto shrink-0 text-xs text-ink-subtle">finnes, nye oppgaver</span>
                  </div>
                ) : (
                  <label className="flex items-baseline gap-2 text-sm">
                    <input
                      type="checkbox"
                      className={`${checkbox} self-center`}
                      checked={selected.has(p.number)}
                      onChange={(e) => toggleProject(p, e.target.checked)}
                    />
                    <span className="tabular text-xs text-ink-subtle">{p.number}</span>
                    <span className="truncate font-medium">{p.name || 'Uten navn'}</span>
                    <span className="ml-auto shrink-0 text-xs text-ink-subtle">{people(p.users)}</span>
                  </label>
                )}
                {p.tasks.length > 0 && (
                  <ul className="mt-1 space-y-1 pl-6">
                    {p.tasks.map((t) => (
                      <li key={t.number}>
                        <label className="flex items-baseline gap-2 text-sm">
                          <input
                            type="checkbox"
                            className={`${checkbox} self-center`}
                            checked={selected.has(taskKey(p.number, t.number))}
                            onChange={(e) => toggleTask(p, t.number, e.target.checked)}
                          />
                          <span className="truncate">{joinNumberName(t.number, t.name)}</span>
                          <span className="ml-auto shrink-0 text-xs text-ink-subtle">{people(t.users)}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
            {shown.length === 0 && <li className="px-3 py-2 text-sm text-ink-muted">Ingen treff</li>}
          </ul>
        </div>
      )}
    </Dialog>,
    document.body,
  );
}
