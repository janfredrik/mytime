// @vitest-environment happy-dom
import type { Line, Week } from '@mytime/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import { type ReactNode, createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '../src/lib/api.js';
import { useWeekEditor } from '../src/lib/useWeekEditor.js';

const WEEK = '2026-09-28';
const NEXT_WEEK = '2026-10-05';
const backupKey = (weekStart: string) => `mytime:unsaved:${weekStart}`;

const line = (id: number, hours = 0): Line => ({
  id: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
  projectNumber: '1001',
  projectName: 'Prosjekt',
  taskNumber: '',
  taskName: '',
  type: 'Normal',
  entries: hours ? [{ date: WEEK, hours, comment: '', timeFrom: '', timeTo: '' }] : [],
});

const week = (weekStart: string, lines: Line[]): Week => ({
  weekStart,
  isoYear: 2026,
  isoWeek: weekStart === WEEK ? 40 : 41,
  status: 'draft',
  lastExportedAt: null,
  lines,
});

/** Server side: one stored copy per week, read by api.week and written by api.saveWeek. */
let server: Map<string, Line[]>;

function setup(weekStart = WEEK) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);
  return renderHook(({ ws }) => useWeekEditor(ws), { wrapper, initialProps: { ws: weekStart } });
}

/** Run timers and the promises they start, inside act so React applies the state updates. */
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
  server = new Map([
    [WEEK, [line(1, 4)]],
    [NEXT_WEEK, []],
  ]);
  vi.spyOn(api, 'week').mockImplementation(async (ws) => week(ws, server.get(ws) ?? []));
  vi.spyOn(api, 'saveWeek').mockImplementation(async (ws, lines) => {
    server.set(ws, lines);
    return week(ws, lines);
  });
});

afterEach(async () => {
  // Unmounting flushes unsaved edits; let that save reach the mock before it is restored.
  cleanup();
  await advance(0);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('useWeekEditor', () => {
  it('loads the week from the server', async () => {
    const { result } = setup();
    await advance(0);
    expect(result.current.lines).toEqual([line(1, 4)]);
    expect(result.current.meta?.isoWeek).toBe(40);
    expect(result.current.saveState).toBe('idle');
  });

  it('debounces edits into one save of the latest lines', async () => {
    const { result } = setup();
    await advance(0);

    act(() => result.current.update((ls) => [...ls, line(2)]));
    await advance(300);
    act(() => result.current.update((ls) => [...ls, line(3)]));
    expect(result.current.saveState).toBe('pending');
    expect(api.saveWeek).not.toHaveBeenCalled();

    await advance(700);
    expect(api.saveWeek).toHaveBeenCalledTimes(1);
    expect(api.saveWeek).toHaveBeenCalledWith(WEEK, [line(1, 4), line(2), line(3)]);
    expect(result.current.saveState).toBe('saved');
  });

  it('keeps unsaved edits and retries after a transient error', async () => {
    const { result } = setup();
    await advance(0);
    vi.mocked(api.saveWeek).mockRejectedValueOnce(new ApiError(503, 'Nede'));

    act(() => result.current.update(() => [line(1, 8)]));
    await advance(700);
    expect(result.current.saveState).toBe('error');
    expect(result.current.saveErrorKind).toBe('transient');
    expect(JSON.parse(sessionStorage.getItem(backupKey(WEEK))!)).toEqual([line(1, 8)]);

    await advance(2_000);
    expect(api.saveWeek).toHaveBeenCalledTimes(2);
    expect(server.get(WEEK)).toEqual([line(1, 8)]);
    expect(result.current.saveState).toBe('saved');
    expect(result.current.saveError).toBeNull();
    expect(sessionStorage.getItem(backupKey(WEEK))).toBeNull();
  });

  it('does not retry or keep a backup when the server rejects the data', async () => {
    const { result } = setup();
    await advance(0);
    vi.mocked(api.saveWeek).mockRejectedValueOnce(new ApiError(400, 'Ugyldig'));

    act(() => result.current.update(() => [line(1, 99)]));
    await advance(700);
    expect(result.current.saveErrorKind).toBe('rejected');
    expect(sessionStorage.getItem(backupKey(WEEK))).toBeNull();

    await advance(60_000);
    expect(api.saveWeek).toHaveBeenCalledTimes(1);
  });

  it('keeps a backup but does not retry when the session has expired', async () => {
    const { result } = setup();
    await advance(0);
    vi.mocked(api.saveWeek).mockRejectedValueOnce(new ApiError(401, 'Utløpt'));

    act(() => result.current.update(() => [line(1, 8)]));
    await advance(700);
    expect(result.current.saveErrorKind).toBe('auth');
    expect(sessionStorage.getItem(backupKey(WEEK))).not.toBeNull();

    await advance(60_000);
    expect(api.saveWeek).toHaveBeenCalledTimes(1);
  });

  it('restores unsaved edits from a backup over the server copy and saves them', async () => {
    sessionStorage.setItem(backupKey(WEEK), JSON.stringify([line(1, 6)]));
    const { result } = setup();
    await advance(0);
    expect(result.current.lines).toEqual([line(1, 6)]);
    expect(server.get(WEEK)).toEqual([line(1, 6)]);
    expect(sessionStorage.getItem(backupKey(WEEK))).toBeNull();
  });

  it('saves pending edits to the week they belong to when switching weeks', async () => {
    const { result, rerender } = setup();
    await advance(0);

    act(() => result.current.update(() => [line(1, 2)]));
    rerender({ ws: NEXT_WEEK });
    await advance(0);

    expect(api.saveWeek).toHaveBeenCalledWith(WEEK, [line(1, 2)]);
    expect(server.get(NEXT_WEEK)).toEqual([]);
    expect(result.current.lines).toEqual([]);
  });

  it('refuses to run a server action while edits are unsaved', async () => {
    const { result } = setup();
    await advance(0);
    vi.mocked(api.saveWeek).mockRejectedValueOnce(new ApiError(503, 'Nede'));
    const action = vi.fn(async () => week(WEEK, []));

    act(() => result.current.update(() => [line(1, 8)]));
    await act(() => expect(result.current.runAction(action)).rejects.toThrow('ikke lagret'));
    expect(action).not.toHaveBeenCalled();
  });
});
