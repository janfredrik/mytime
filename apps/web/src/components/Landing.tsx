import { formatHours, holidayName, isoWeekOf, todayISO, weekDates, weekStartOf } from '@mytime/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { dayName, shortDate } from '../lib/format';
import { Check, Clock } from './icons';
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

function SignInButton() {
  const [leaving, setLeaving] = useState(false);
  const ref = useRef<HTMLAnchorElement>(null);
  const returnTo = encodeURIComponent(window.location.pathname + window.location.search);

  // The only action on the page, so Enter signs in. React's autoFocus doesn't apply to links.
  useEffect(() => ref.current?.focus(), []);

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
      className="ms-signin inline-flex h-12 items-center gap-3 rounded-[3px] px-4 text-[15px] font-semibold transition-[box-shadow,background-color] duration-200"
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

export function Landing() {
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
            <SignInButton />
          </div>
          <p className="mt-4 text-sm text-ink-subtle">Bruk jobbkontoen din</p>
        </section>

        <div aria-hidden="true" className="landing-stage min-w-0">
          <Timesheet />
        </div>
      </main>
    </div>
  );
}
