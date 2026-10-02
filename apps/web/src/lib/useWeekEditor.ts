import type { Line, Week } from '@mytime/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api } from './api';

export type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';
/** transient: retried automatically. auth: needs a new sign-in. rejected: the data must change. */
export type SaveErrorKind = 'transient' | 'auth' | 'rejected';
export type WeekMeta = Omit<Week, 'lines'>;

const SAVE_DELAY_MS = 700;
const RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000];

/**
 * Unsaved edits are kept in sessionStorage until the server has them, so they survive a
 * reload, a sign-in after the session expired, or leaving the week while offline.
 */
const backupKey = (weekStart: string) => `mytime:unsaved:${weekStart}`;

function writeBackup(weekStart: string, lines: Line[]) {
  try {
    sessionStorage.setItem(backupKey(weekStart), JSON.stringify(lines));
  } catch {
    // Storage full or blocked: the in-memory copy is all we have.
  }
}

function readBackup(weekStart: string): Line[] | null {
  try {
    const raw = sessionStorage.getItem(backupKey(weekStart));
    return raw ? (JSON.parse(raw) as Line[]) : null;
  } catch {
    return null;
  }
}

function clearBackup(weekStart: string) {
  try {
    sessionStorage.removeItem(backupKey(weekStart));
  } catch {
    // ignore
  }
}

function errorKind(err: unknown): SaveErrorKind {
  if (!(err instanceof ApiError)) return 'transient';
  if (err.isUnauthorized) return 'auth';
  return err.isTransient ? 'transient' : 'rejected';
}

function metaOf({ lines: _lines, ...meta }: Week): WeekMeta {
  return meta;
}

/**
 * Local editing state for one week with debounced autosave.
 * Edits are applied locally right away and saved as a whole week in the background.
 */
export function useWeekEditor(weekStart: string) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['week', weekStart],
    queryFn: () => api.week(weekStart),
    staleTime: 30_000,
  });

  const [lines, setLines] = useState<Line[] | null>(null);
  const [meta, setMeta] = useState<WeekMeta | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveErrorKind, setSaveErrorKind] = useState<SaveErrorKind | null>(null);

  const linesRef = useRef<Line[] | null>(null);
  const weekRef = useRef(weekStart);
  const dirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const retryRef = useRef<{ timer?: ReturnType<typeof setTimeout>; attempt: number }>({ attempt: 0 });

  const afterSave = useCallback(
    (week: Week) => {
      qc.setQueryData(['week', week.weekStart], week);
      void qc.invalidateQueries({ queryKey: ['calendar'] });
      void qc.invalidateQueries({ queryKey: ['flex'] });
      void qc.invalidateQueries({ queryKey: ['suggestions'] });
    },
    [qc],
  );

  /**
   * Save pending edits now. The week and lines are captured synchronously (so a save
   * triggered while switching weeks goes to the right week), and saves are serialised.
   */
  const flush = useCallback((): Promise<void> => {
    clearTimeout(timerRef.current);
    clearTimeout(retryRef.current.timer);
    if (!dirtyRef.current || !linesRef.current) return chainRef.current;
    const ws = weekRef.current;
    const payload = linesRef.current;
    dirtyRef.current = false;
    setSaveState('saving');
    const run = async () => {
      try {
        const week = await api.saveWeek(ws, payload);
        const current = ws === weekRef.current;
        if (!current || !dirtyRef.current) clearBackup(ws);
        afterSave(current ? { ...week, lines: linesRef.current ?? payload } : week);
        if (current) {
          retryRef.current.attempt = 0;
          setMeta(metaOf(week));
          setSaveError(null);
          setSaveErrorKind(null);
          setSaveState(dirtyRef.current ? 'pending' : 'saved');
        }
      } catch (err) {
        const kind = errorKind(err);
        // Rejected data would fail again from storage, so only keep what a retry can save.
        if (kind === 'rejected') clearBackup(ws);
        else writeBackup(ws, ws === weekRef.current ? (linesRef.current ?? payload) : payload);
        if (ws !== weekRef.current) return; // Restored and retried when the week is opened again.
        dirtyRef.current = true;
        setSaveState('error');
        setSaveErrorKind(kind);
        setSaveError(err instanceof Error ? err.message : 'Lagring feilet');
        if (kind === 'transient') {
          const delay = RETRY_DELAYS_MS[Math.min(retryRef.current.attempt, RETRY_DELAYS_MS.length - 1)]!;
          retryRef.current.attempt += 1;
          retryRef.current.timer = setTimeout(() => void flushRef.current(), delay);
        }
      }
    };
    chainRef.current = chainRef.current.then(run);
    return chainRef.current;
  }, [afterSave]);
  const flushRef = useRef(flush);
  flushRef.current = flush;

  // Switch week: flush the previous week's edits, then load the new one.
  useEffect(() => {
    weekRef.current = weekStart;
    retryRef.current.attempt = 0;
    const cached = qc.getQueryData<Week>(['week', weekStart]);
    const backup = readBackup(weekStart);
    linesRef.current = backup ?? cached?.lines ?? null;
    setLines(linesRef.current);
    setMeta(cached ? metaOf(cached) : null);
    setSaveError(null);
    setSaveErrorKind(null);
    if (backup) {
      // Edits that never reached the server: keep them over server data and save them now.
      dirtyRef.current = true;
      setSaveState('pending');
      timerRef.current = setTimeout(() => void flush(), 0);
    } else {
      setSaveState('idle');
    }
    return () => {
      void flush();
    };
  }, [weekStart, qc, flush]);

  // Adopt server data when it arrives, unless there are local edits.
  useEffect(() => {
    const data = query.data;
    if (!data || data.weekStart !== weekStart || dirtyRef.current) return;
    linesRef.current = data.lines;
    setLines(data.lines);
    setMeta(metaOf(data));
  }, [query.data, weekStart]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        if (linesRef.current) writeBackup(weekRef.current, linesRef.current);
        void flush();
        e.preventDefault();
      }
    };
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    // Back online: don't wait for the next scheduled retry.
    const onOnline = () => {
      if (dirtyRef.current) void flush();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onHide);
      clearTimeout(retryRef.current.timer);
    };
  }, [flush]);

  const update = useCallback(
    (fn: (lines: Line[]) => Line[]) => {
      if (!linesRef.current) return;
      const next = fn(linesRef.current);
      linesRef.current = next;
      setLines(next);
      dirtyRef.current = true;
      setSaveState('pending');
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
    },
    [flush],
  );

  /** Flush edits, run a server action that returns the week, and adopt its result. */
  const runAction = useCallback(
    async (action: () => Promise<Week>) => {
      await flush();
      // Never act on the server's copy while local edits are missing from it (an export
      // would silently leave out the latest hours).
      if (dirtyRef.current) throw new Error('Endringene dine er ikke lagret ennå. Prøv igjen når de er lagret');
      const week = await action();
      afterSave(week);
      if (week.weekStart === weekRef.current) {
        linesRef.current = week.lines;
        setLines(week.lines);
        setMeta(metaOf(week));
      }
      return week;
    },
    [flush, afterSave],
  );

  const reload = useCallback(async () => {
    await flush();
    dirtyRef.current = false;
    await qc.invalidateQueries({ queryKey: ['week', weekRef.current] });
  }, [flush, qc]);

  return {
    lines,
    meta,
    isLoading: lines === null && query.isLoading,
    loadError: query.error,
    saveState,
    saveError,
    saveErrorKind,
    update,
    flush,
    runAction,
    reload,
  };
}
