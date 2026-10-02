import type { Line, Week } from '@mytime/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

export type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';
export type WeekMeta = Omit<Week, 'lines'>;

const SAVE_DELAY_MS = 700;

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

  const linesRef = useRef<Line[] | null>(null);
  const weekRef = useRef(weekStart);
  const dirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const chainRef = useRef<Promise<void>>(Promise.resolve());

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
    if (!dirtyRef.current || !linesRef.current) return chainRef.current;
    const ws = weekRef.current;
    const payload = linesRef.current;
    dirtyRef.current = false;
    setSaveState('saving');
    const run = async () => {
      try {
        const week = await api.saveWeek(ws, payload);
        const current = ws === weekRef.current;
        afterSave(current ? { ...week, lines: linesRef.current ?? payload } : week);
        if (current) {
          setMeta(metaOf(week));
          setSaveError(null);
          setSaveState(dirtyRef.current ? 'pending' : 'saved');
        }
      } catch (err) {
        if (ws === weekRef.current) {
          dirtyRef.current = true;
          setSaveState('error');
          setSaveError(err instanceof Error ? err.message : 'Lagring feilet');
        }
      }
    };
    chainRef.current = chainRef.current.then(run);
    return chainRef.current;
  }, [afterSave]);

  // Switch week: flush the previous week's edits, then load the new one.
  useEffect(() => {
    weekRef.current = weekStart;
    const cached = qc.getQueryData<Week>(['week', weekStart]);
    linesRef.current = cached?.lines ?? null;
    setLines(linesRef.current);
    setMeta(cached ? metaOf(cached) : null);
    setSaveState('idle');
    setSaveError(null);
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
        void flush();
        e.preventDefault();
      }
    };
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onHide);
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
    update,
    flush,
    runAction,
    reload,
  };
}
