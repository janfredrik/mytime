import { formatHours, holidayName, isoWeekOf, todayISO, weekDates, weekStartOf } from '@mytime/shared';
import { type FormEvent, type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, api } from '../lib/api';
import { dayName, shortDate } from '../lib/format';
import { Alert, Check, Clock } from './icons';
import { Spinner } from './ui';

/* The logged-out front page. Its one moment: this week's timesheet fills itself in, keystroke by
   keystroke, the way the app is meant to be used, and every day stamps itself full at 8 hours. */

const ROWS = [
  { task: 'Utvikling', project: 'Kundeprosjekt', hours: [6, 5.5, 6, 4.5, 5] },
  { task: 'Møter', project: 'Kundeprosjekt', hours: [1.5, 2, 1, 1.5, 1] },
  { task: 'Kompetanse', project: 'Interntid', hours: [0.5, 0.5, 1, 2, 2] },
];

type Cell = { r: number; c: number };
type Step =
  | { kind: 'move'; to: Cell; key?: string; wait: number }
  | { kind: 'type'; cell: Cell; text: string; key: string; wait: number }
  | { kind: 'full'; c: number; wait: number }
  | { kind: 'done'; wait: number };

type Demo = {
  typed: Record<string, string>;
  caret: Cell | null;
  full: number[];
  stamping: number | null;
  keys: { id: number; label: string }[];
  done: boolean;
};

const cellKey = (c: Cell) => `${c.r}:${c.c}`;

function buildScript(workdays: number[]): Step[] {
  const steps: Step[] = [];
  workdays.forEach((c, i) => {
    // Gets a little quicker per day, the way hands warm up on a keyboard.
    const pace = 1 - (i / Math.max(workdays.length - 1, 1)) * 0.4;
    steps.push({ kind: 'move', to: { r: 0, c }, wait: (i === 0 ? 700 : 300) * pace });
    ROWS.forEach((row, r) => {
      const cell = { r, c };
      const text = formatHours(row.hours[c]!);
      [...text].forEach((ch, k) =>
        steps.push({ kind: 'type', cell, text: text.slice(0, k + 1), key: ch, wait: (k === 0 ? 150 : 95) * pace }),
      );
      if (r < ROWS.length - 1) steps.push({ kind: 'move', to: { r: r + 1, c }, key: 'Enter', wait: 170 * pace });
    });
    steps.push({ kind: 'full', c, wait: 260 * pace });
  });
  steps.push({ kind: 'done', wait: 900 });
  return steps;
}

function finalDemo(workdays: number[]): Demo {
  const typed: Record<string, string> = {};
  for (const c of workdays) ROWS.forEach((row, r) => (typed[cellKey({ r, c })] = formatHours(row.hours[c]!)));
  return { typed, caret: null, full: workdays, stamping: null, keys: [], done: true };
}

const EMPTY: Demo = { typed: {}, caret: null, full: [], stamping: null, keys: [], done: false };

function useTypingDemo(workdays: number[]) {
  const reduce = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const [demo, setDemo] = useState<Demo>(() => (reduce ? finalDemo(workdays) : EMPTY));

  useEffect(() => {
    if (reduce) return;
    const script = buildScript(workdays);
    let i = 0;
    let keyId = 0;
    let timer: number;
    const press = (keys: Demo['keys'], label?: string) =>
      label ? [...keys, { id: ++keyId, label }].slice(-7) : keys;

    const run = () => {
      const step = script[i++];
      if (!step) return;
      setDemo((d) => {
        switch (step.kind) {
          case 'move':
            return { ...d, caret: step.to, stamping: null, keys: press(d.keys, step.key) };
          case 'type':
            return { ...d, typed: { ...d.typed, [cellKey(step.cell)]: step.text }, keys: press(d.keys, step.key) };
          case 'full':
            return { ...d, caret: null, full: [...d.full, step.c], stamping: step.c };
          case 'done':
            return { ...d, done: true, stamping: null };
        }
      });
      const next = script[i];
      if (next) timer = window.setTimeout(run, next.wait);
    };
    timer = window.setTimeout(run, script[0]!.wait);
    return () => window.clearTimeout(timer);
  }, [reduce, workdays]);

  return demo;
}

function MicrosoftLogo() {
  return (
    <svg width="21" height="21" viewBox="0 0 21 21" aria-hidden="true" className="shrink-0">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

function SignInButton({ ref, ready }: { ref: RefObject<HTMLAnchorElement | null>; ready: boolean }) {
  const [leaving, setLeaving] = useState(false);
  const returnTo = encodeURIComponent(window.location.pathname + window.location.search);

  // The only action on the page, so Enter signs in. React's autoFocus doesn't apply to links.
  useEffect(() => ref.current?.focus(), [ref]);

  useEffect(() => {
    // Coming back with the browser's back button restores the page from cache; reset the state.
    const onShow = () => setLeaving(false);
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, []);

  return (
    <a
      href={`/auth/login?returnTo=${returnTo}`}
      ref={ref}
      onClick={() => setLeaving(true)}
      aria-busy={leaving}
      className={`ms-signin ${ready ? 'ms-signin-ready' : ''} inline-flex h-12 items-center gap-3 rounded-[3px] px-4 text-[15px] font-semibold transition-[box-shadow,background-color] duration-200`}
    >
      {leaving ? <Spinner className="h-[21px] w-[21px]" /> : <MicrosoftLogo />}
      {leaving ? 'Sender deg til Microsoft …' : 'Logg inn med Microsoft'}
    </a>
  );
}

function Timesheet() {
  const today = todayISO();
  const weekStart = weekStartOf(today);
  const { week } = isoWeekOf(weekStart);
  const days = useMemo(
    () =>
      weekDates(weekStart)
        .slice(0, 5)
        .map((date, c) => ({ date, c, holiday: holidayName(date) })),
    [weekStart],
  );
  const workdays = useMemo(() => days.filter((d) => !d.holiday).map((d) => d.c), [days]);
  const demo = useTypingDemo(workdays);

  const value = (r: number, c: number) => {
    const t = demo.typed[cellKey({ r, c })];
    return t ? Number(t.replace(',', '.')) || 0 : 0;
  };
  const dayTotal = (c: number) => ROWS.reduce((s, _, r) => s + value(r, c), 0);
  const weekTotal = days.reduce((s, d) => s + dayTotal(d.c), 0);
  const allFull = demo.done && workdays.length > 0;
  const range = `${shortDate(days[0]!.date)}–${shortDate(days[4]!.date)}`;

  const dayBg = (d: (typeof days)[number]) => (d.date === today ? 'bg-today' : '');

  return (
    <div className="landing-sheet relative w-full rounded-2xl border border-line bg-surface">
      <div className="flex items-center gap-3 border-b border-line px-5 py-4 sm:px-6">
        <div>
          <p className="text-lg font-semibold tracking-tight">Uke {week}</p>
          <p className="text-xs text-ink-subtle tabular">{range}</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {allFull && (
            <span className="stamp-in inline-flex items-center gap-1 rounded-full bg-positive-soft py-0.5 pr-2.5 pl-1.5 text-xs font-semibold text-positive">
              <Check size={13} strokeWidth={2.8} /> Full uke
            </span>
          )}
          <p className="text-2xl font-semibold tracking-tight tabular">
            {formatHours(weekTotal)}
            <span className="ml-1 text-sm font-medium text-ink-subtle">t</span>
          </p>
        </div>
      </div>

      <table className="w-full table-fixed border-collapse text-sm">
        <colgroup>
          <col className="w-[30%] sm:w-[26%]" />
          {days.map((d) => (
            <col key={d.date} />
          ))}
        </colgroup>
        <thead>
          <tr className="border-b border-line text-left">
            <th className="px-3 py-2.5 text-xs font-medium text-ink-subtle sm:px-5">Aktivitet</th>
            {days.map((d) => (
              <th key={d.date} className={`px-1 py-2.5 text-center text-xs font-medium ${dayBg(d)}`}>
                <span className="inline-flex items-center gap-1">
                  <span className={d.date === today ? 'text-ink' : 'text-ink-muted'}>{dayName(d.c)}</span>
                  {demo.full.includes(d.c) && (
                    <Check size={12} strokeWidth={2.6} className="text-positive" />
                  )}
                </span>
                <span className="block font-normal text-ink-subtle tabular">{shortDate(d.date)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row, r) => (
            <tr key={row.task} className="border-b border-line">
              <td className="px-3 py-3 sm:px-5">
                <span className="block truncate font-medium">{row.task}</span>
                <span className="hidden truncate text-xs text-ink-subtle sm:block">{row.project}</span>
              </td>
              {days.map((d) => {
                const active = demo.caret?.r === r && demo.caret?.c === d.c;
                const text = demo.typed[cellKey({ r, c: d.c })];
                return (
                  <td
                    key={d.date}
                    style={{ '--row': r } as React.CSSProperties}
                    className={`px-1 py-1.5 ${dayBg(d)} ${demo.stamping === d.c ? 'column-wash' : ''}`}
                  >
                    <div
                      className={`flex h-10 items-center justify-center rounded-md text-base tabular transition-[box-shadow,background-color] duration-150 sm:h-11 sm:text-[17px] ${
                        active ? 'bg-surface shadow-[0_0_0_2px_var(--color-accent)]' : ''
                      } ${d.holiday ? 'text-ink-subtle' : ''}`}
                    >
                      {d.holiday ? (r === 0 ? '–' : '') : text}
                      {active && <span className="landing-caret" />}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="px-3 py-3 text-xs font-medium text-ink-subtle sm:px-5">Sum</td>
            {days.map((d) => {
              const full = demo.full.includes(d.c);
              const total = dayTotal(d.c);
              return (
                <td key={d.date} className={`px-1 py-2.5 text-center ${dayBg(d)}`}>
                  {d.holiday ? (
                    <span className="block truncate text-xs text-ink-subtle" title={d.holiday}>
                      {d.holiday}
                    </span>
                  ) : full ? (
                    <span
                      className={`inline-flex items-center gap-0.5 rounded-full bg-positive-soft py-0.5 pr-2 pl-1.5 text-sm font-semibold text-positive tabular ${
                        demo.stamping === d.c ? 'stamp-in' : ''
                      }`}
                    >
                      <Check size={12} strokeWidth={2.8} />
                      {formatHours(total)}
                    </span>
                  ) : (
                    <span className={`text-sm font-medium tabular ${total ? 'text-ink' : 'text-ink-subtle'}`}>
                      {formatHours(total)}
                    </span>
                  )}
                </td>
              );
            })}
          </tr>
        </tfoot>
      </table>

      <div className="flex h-12 items-center justify-end gap-1.5 border-t border-line px-5 sm:px-6">
        {demo.keys.map((k) => (
          <kbd key={k.id} className="landing-key">
            {k.label}
          </kbd>
        ))}
      </div>
    </div>
  );
}

type InviteState =
  | { step: 'idle' }
  | { step: 'sending'; slow: boolean }
  | { step: 'error'; message: string }
  | { step: 'done'; status: 'ready' | 'invited' | 'pending' };

const DONE_COPY = {
  invited: {
    title: 'Du er lagt til som gjest',
    body: 'Logg inn med Microsoft-knappen over. Første gang ber Microsoft deg godta invitasjonen.',
  },
  ready: {
    title: 'Kontoen din har allerede tilgang',
    body: 'Logg inn med knappen over, og velg jobbkontoen din når Microsoft spør.',
  },
  pending: {
    title: 'Invitasjonen er sendt',
    body: 'Det kan ta et minutt før kontoen er klar. Vent litt, og logg inn med knappen over.',
  },
};

/* Where each spark flies: angle in degrees, distance in px. Uneven on purpose, like ink off a stamp. */
const SPARKS = [
  [-8, 33], [24, 27], [52, 35], [83, 26], [112, 34], [141, 28],
  [170, 36], [203, 27], [232, 33], [262, 26], [291, 35], [322, 29],
] as const;

/** The check that stamps itself in: the disc lands, the tick draws, and a ring of sparks bursts out. */
function StampMark() {
  return (
    <span className="stamp-mark relative mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center" aria-hidden="true">
      {SPARKS.map(([angle, dist], i) => (
        <span
          key={angle}
          className="stamp-spark"
          style={{ '--a': `${angle}deg`, '--d': `${dist}px`, '--i': i } as React.CSSProperties}
        />
      ))}
      <span className="stamp-disc absolute inset-0 rounded-full bg-positive-soft" />
      <svg viewBox="0 0 24 24" width="17" height="17" className="relative text-positive">
        <path
          className="stamp-tick"
          d="M5 12.5l4.5 4.5L19 7.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
        />
      </svg>
    </span>
  );
}

/** For people outside the tenant: add themselves as a guest from an approved domain, then sign in. */
function GuestAccess({ onReady }: { onReady: () => void }) {
  const [open, setOpen] = useState(() => window.location.hash === '#tilgang');
  // Clipping is only needed while the panel unfolds; afterwards the stamp's sparks may fly past its edge.
  const [settled, setSettled] = useState(open);
  const [email, setEmail] = useState('');
  const [state, setState] = useState<InviteState>({ step: 'idle' });
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = state.step === 'sending';

  useEffect(() => {
    if (open && state.step === 'idle') inputRef.current?.focus({ preventScroll: true });
  }, [open, state.step]);

  useEffect(() => {
    if (!busy) return;
    // The server waits for the new account to appear in the directory; say so once it takes a while.
    const t = window.setTimeout(() => setState({ step: 'sending', slow: true }), 2200);
    return () => window.clearTimeout(t);
  }, [busy]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setState({ step: 'sending', slow: false });
    try {
      const { status } = await api.invite(email);
      setState({ step: 'done', status });
      onReady();
    } catch (err) {
      setState({
        step: 'error',
        message: err instanceof ApiError ? err.message : 'Noe gikk galt. Prøv igjen',
      });
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  return (
    <div className="mt-4">
      <p className="text-sm text-ink-subtle">
        Bruk jobbkontoen din.{' '}
        <button
          type="button"
          aria-expanded={open}
          aria-controls="guest-access"
          onClick={() => {
            setSettled(false);
            setOpen((o) => !o);
          }}
          className="guest-toggle font-medium text-ink-muted underline decoration-line-strong underline-offset-4 transition-colors hover:text-ink hover:decoration-accent"
        >
          Får du ikke logget inn?
        </button>
      </p>

      <div
        id="guest-access"
        className="guest-reveal"
        data-open={open}
        data-settled={settled}
        inert={!open}
        onTransitionEnd={(e) => e.propertyName === 'grid-template-rows' && setSettled(open)}
      >
        <div className="min-h-0">
          <div className="guest-panel mt-5 max-w-[25rem] border-t border-line pt-5">
            {state.step === 'done' ? (
              <div role="status" className="flex gap-3.5">
                {state.status === 'pending' ? (
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning">
                    <Clock size={16} strokeWidth={2.2} />
                  </span>
                ) : (
                  <StampMark />
                )}
                <div className="guest-done">
                  <p className="font-semibold">{DONE_COPY[state.status].title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-ink-muted">{DONE_COPY[state.status].body}</p>
                  <p className="mt-2 text-xs text-ink-subtle">{email}</p>
                </div>
              </div>
            ) : (
              <form onSubmit={submit} noValidate>
                <p className="text-sm leading-relaxed text-ink-muted">
                  Skriv inn jobbadressen din, så legger vi deg til som gjest.
                </p>
                <label htmlFor="guest-email" className="mt-4 mb-1.5 block text-xs font-medium text-ink-muted">
                  Jobbadresse
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    ref={inputRef}
                    id="guest-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    spellCheck={false}
                    required
                    value={email}
                    readOnly={busy}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (state.step === 'error') setState({ step: 'idle' });
                    }}
                    placeholder="navn@firma.no"
                    aria-invalid={state.step === 'error'}
                    aria-describedby="guest-hint"
                    className="h-11 w-full min-w-0 rounded-lg sm:flex-1 border border-line-strong bg-surface px-3 text-[15px] text-ink placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/25 focus:outline-none aria-invalid:border-negative aria-invalid:focus:border-negative aria-invalid:focus:ring-negative/25 read-only:text-ink-muted"
                  />
                  <button
                    type="submit"
                    disabled={!email.trim()}
                    aria-busy={busy}
                    className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-ink shadow-sm transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 aria-busy:pointer-events-none"
                  >
                    {busy && <Spinner className="h-3.5 w-3.5" />}
                    {busy ? 'Legger til …' : 'Gi meg tilgang'}
                  </button>
                </div>
                <p id="guest-hint" aria-live="polite" className="mt-2 min-h-[1.25rem] text-xs leading-5">
                  {state.step === 'error' ? (
                    <span className="inline-flex items-start gap-1.5 text-negative">
                      <Alert size={13} className="mt-[3px] shrink-0" />
                      {state.message}
                    </span>
                  ) : (
                    busy && (
                      <span className="text-ink-muted">
                        {state.slow ? 'Venter på at kontoen blir klar. Det tar noen sekunder …' : 'Legger deg til som gjest …'}
                      </span>
                    )
                  )}
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Landing() {
  const signIn = useRef<HTMLAnchorElement>(null);
  const [ready, setReady] = useState(false);
  const [guestAccess, setGuestAccess] = useState(false);

  useEffect(() => {
    api.inviteEnabled().then(
      (r) => setGuestAccess(r.enabled),
      () => setGuestAccess(false),
    );
  }, []);

  return (
    <div className="landing relative flex min-h-dvh flex-col overflow-hidden">
      <header className="mx-auto flex w-full max-w-[1280px] items-center px-6 pt-6 sm:px-10">
        <span className="flex items-center gap-2 text-base font-semibold tracking-tight">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-accent-ink">
            <Clock size={17} strokeWidth={2.2} />
          </span>
          MyTime
        </span>
      </header>

      <main className="mx-auto grid w-full max-w-[1280px] flex-1 items-center gap-12 px-6 py-12 sm:px-10 lg:grid-cols-[minmax(0,25rem)_minmax(0,1fr)] lg:gap-16">
        <section>
          <h1 className="text-[2.6rem] leading-[1.04] font-semibold tracking-[-0.035em] text-balance sm:text-[3.4rem]">
            Ikke kast bort verdifulle minutter
          </h1>
          <p className="mt-5 max-w-[34ch] text-lg leading-relaxed text-ink-muted">
            Importer, før timene, følg fleksen og eksporter rett til timesystemet. Lagres mens du skriver.
          </p>
          <div className="mt-9">
            <SignInButton ref={signIn} ready={ready} />
          </div>
          {guestAccess ? (
            <GuestAccess
              onReady={() => {
                setReady(true);
                signIn.current?.focus({ preventScroll: true });
              }}
            />
          ) : (
            <p className="mt-4 text-sm text-ink-subtle">Bruk jobbkontoen din</p>
          )}
        </section>

        <div aria-hidden="true" className="landing-stage min-w-0">
          <Timesheet />
        </div>
      </main>
    </div>
  );
}
