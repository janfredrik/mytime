import { DEFAULT_DAILY_NORM, todayISO, weekStartOf } from '@mytime/shared';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { Landing } from './components/Landing';
import { SettingsDialog } from './components/SettingsDialog';
import { WeekView } from './components/WeekView';
import { Clock, Logout, Settings } from './components/icons';
import { Spinner } from './components/ui';
import { ApiError, api } from './lib/api';
import { weekFromUrl, weekToUrlParam } from './lib/format';

function useToday() {
  const [today, setToday] = useState(() => todayISO());
  useEffect(() => {
    const t = setInterval(() => setToday(todayISO()), 60_000);
    return () => clearInterval(t);
  }, []);
  return today;
}

function Logo() {
  return (
    <span className="flex items-center gap-2 text-base font-semibold tracking-tight">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-accent-ink">
        <Clock size={17} strokeWidth={2.2} />
      </span>
      MyTime
    </span>
  );
}

export function App() {
  const today = useToday();
  const me = useQuery({
    queryKey: ['me'],
    queryFn: api.me,
    retry: (count, err) => !(err instanceof ApiError && err.status === 401) && count < 2,
  });
  const [weekStart, setWeekStart] = useState(weekFromUrl);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const onPop = () => setWeekStart(weekFromUrl());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((date: string) => {
    const ws = weekStartOf(date);
    setWeekStart(ws);
    const url = `/?uke=${weekToUrlParam(ws)}`;
    if (window.location.pathname + window.location.search !== url) window.history.pushState(null, '', url);
  }, []);

  if (me.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-ink-muted">
        <Spinner />
      </div>
    );
  }
  if (me.error instanceof ApiError && me.error.status === 401) return <Landing />;
  if (me.error || !me.data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center text-sm">
        <p className="text-negative">Kunne ikke koble til serveren. Timene dine er ikke berørt.</p>
        <button
          type="button"
          onClick={() => void me.refetch()}
          disabled={me.isFetching}
          className="inline-flex items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 py-1.5 font-medium hover:bg-hover disabled:opacity-50"
        >
          {me.isFetching && <Spinner className="h-3 w-3" />} Prøv igjen
        </button>
      </div>
    );
  }

  const user = me.data;
  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-3 px-4 sm:px-6">
          <Logo />
          <div className="ml-auto flex items-center gap-1">
            <span className="mr-2 hidden text-sm text-ink-muted sm:inline" title={user.email}>
              {user.name}
            </span>
            <button
              type="button"
              aria-label="Innstillinger"
              onClick={() => setSettingsOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-ink-muted hover:bg-hover hover:text-ink"
            >
              <Settings /> <span className="hidden sm:inline">Innstillinger</span>
            </button>
            <a
              href="/auth/logout"
              aria-label="Logg ut"
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-ink-muted hover:bg-hover hover:text-ink"
            >
              <Logout /> <span className="hidden sm:inline">Logg ut</span>
            </a>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6">
        <WeekView
          weekStart={weekStart}
          today={today}
          dailyNorm={user.settings.dailyNormHours ?? DEFAULT_DAILY_NORM}
          flexStartDate={user.settings.flexStartDate}
          onNavigate={navigate}
        />
      </main>
      <SettingsDialog open={settingsOpen} settings={user.settings} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
