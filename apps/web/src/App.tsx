import { DEFAULT_DAILY_NORM, todayISO, weekStartOf } from '@mytime/shared';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
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

function LoginScreen() {
  const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8 text-center shadow-sm">
        <div className="flex justify-center">
          <Logo />
        </div>
        <h1 className="mt-6 text-xl font-semibold">Timeføring</h1>
        <p className="mt-1 text-sm text-ink-muted">Logg inn med jobbkontoen din for å føre timer.</p>
        <a
          href={`/auth/login?returnTo=${returnTo}`}
          className="mt-6 inline-flex w-full items-center justify-center gap-2.5 rounded-lg border border-line-strong bg-surface px-4 py-2.5 text-sm font-medium shadow-sm hover:bg-hover"
        >
          <svg width="16" height="16" viewBox="0 0 21 21" aria-hidden="true">
            <rect x="1" y="1" width="9" height="9" fill="#f25022" />
            <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
            <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
            <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
          </svg>
          Logg inn med Microsoft
        </a>
      </div>
    </div>
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
  if (me.error instanceof ApiError && me.error.status === 401) return <LoginScreen />;
  if (me.error || !me.data) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-sm text-negative">
        Kunne ikke koble til serveren. Prøv å laste siden på nytt.
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
              onClick={() => setSettingsOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-ink-muted hover:bg-hover hover:text-ink"
            >
              <Settings /> <span className="hidden sm:inline">Innstillinger</span>
            </button>
            <a
              href="/auth/logout"
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
