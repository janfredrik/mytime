import {
  type ImportPreview,
  type Me,
  addDays,
  formatHours,
  isoWeekOf,
  parseHours,
  todayISO,
  weekStartOf,
} from '@mytime/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { exampleExportFileName, longDate, shortDate } from '../lib/format';
import { Alert, Check, Upload } from './icons';
import { type IllustrationFocus, MyTimeIllustration } from './MyTimeIllustration';
import { Button, Spinner, inputClass } from './ui';

const MYTIME_URL = 'https://mytime.tietoevry.com';
const EXAMPLE_BALANCE = '19';

/* First sign-in: bring the flex balance and one week over from the official My Time, then go
   straight to the timesheet. Both steps are optional; the page is shown once per user. */

export function Welcome({ user, onDone }: { user: Me; onDone: (weekStart: string | null) => void }) {
  const qc = useQueryClient();
  const today = todayISO();
  const [focus, setFocus] = useState<IllustrationFocus>('flex');

  const [balance, setBalance] = useState('');
  const [startDate, setStartDate] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [reading, setReading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A modal over the (blurred) timesheet: showModal() gives the focus trap and the backdrop.
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
  }, []);

  const exampleName = useMemo(() => exampleExportFileName(weekStartOf(today)), [today]);
  const balanceValue = balance.trim() ? parseHours(balance) : null;
  const balanceInvalid = balance.trim() !== '' && balanceValue === null;

  const weeks = preview?.weeks ?? [];
  const lastImported = weeks
    .map((w) => w.weekStart)
    .sort()
    .at(-1);
  // My Time's balance already counts the weeks in the export; start counting after them.
  const suggestedStart = lastImported ? addDays(lastImported, 7) : weekStartOf(today);
  const effectiveStart = startDate ?? suggestedStart;

  const choose = async (f: File | undefined) => {
    if (!f) return;
    setFocus('import');
    setFile(f);
    setPreview(null);
    setFileError(null);
    setReading(true);
    try {
      // The week comes from the dates in the file; this one only places rows without a date.
      setPreview(await api.importPreview(weekStartOf(today), f));
    } catch (err) {
      setFileError(err instanceof Error ? err.message : 'Kunne ikke lese filen');
    } finally {
      setReading(false);
    }
  };

  const clearFile = () => {
    setFile(null);
    setPreview(null);
    setFileError(null);
  };

  const hasBalance = balanceValue !== null;
  const hasImport = weeks.length > 0;
  const importLabel =
    weeks.length === 1 ? `uke ${isoWeekOf(weeks[0]!.weekStart).week}` : `${weeks.length} uker`;
  const primaryLabel =
    hasBalance && hasImport
      ? `Lagre fleks og importer ${importLabel}`
      : hasImport
        ? `Importer ${importLabel}`
        : hasBalance
          ? 'Lagre fleks'
          : 'Kom i gang';

  const finish = async (skip: boolean) => {
    if (!skip && balanceInvalid) {
      setFocus('flex');
      setError('Fleksbalansen må være et tall, for eksempel 19 eller -3,5');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (!skip && hasBalance) {
        await api.saveSettings({
          dailyNormHours: user.settings.dailyNormHours,
          flexStartBalance: balanceValue,
          flexStartDate: effectiveStart,
        });
      }
      if (!skip && hasImport) {
        await api.importCommit({
          weeks: weeks.map((w) => ({ weekStart: w.weekStart, lines: w.lines })),
        });
      }
      await api.markOnboarded();
      await qc.invalidateQueries();
      onDone(!skip && hasImport ? weeks[0]!.weekStart : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lagring feilet');
      setSaving(false);
    }
  };

  const stepClass = (step: IllustrationFocus) => `welcome-step ${focus === step ? 'welcome-step-on' : ''}`;

  return (
    <dialog
      ref={dialog}
      aria-labelledby="welcome-title"
      // Escape would throw the welcome away for good; leaving takes an explicit "Hopp over".
      onCancel={(e) => e.preventDefault()}
      className="welcome-dialog m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[1180px] overflow-y-auto overscroll-contain rounded-3xl border border-line bg-canvas p-0 text-ink"
    >
      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-14 gap-y-8 px-5 py-8 sm:px-10 sm:py-10 lg:grid-cols-[minmax(0,27rem)_minmax(0,1fr)] lg:py-12">
        <header className="lg:col-start-1">
          <h1
            id="welcome-title"
            className="text-[2rem] leading-[1.1] font-semibold tracking-[-0.03em] text-balance sm:text-[2.4rem]"
          >
            Ta med deg det du har i MyTime
          </h1>
          <p className="mt-3 max-w-[44ch] text-[15px] leading-relaxed text-ink-muted">
            Fleksisaldo og én uke med timer, så starter du der du slapp. Begge finner du på{' '}
            <a
              href={MYTIME_URL}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-accent underline decoration-accent/40 underline-offset-[3px] hover:decoration-accent"
            >
              mytime.tietoevry.com
            </a>.{' '}
          </p>
        </header>

        <div className="min-w-0 lg:sticky lg:top-0 lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:self-start">
          <MyTimeIllustration
            focus={focus}
            flexValue={hasBalance ? formatHours(balanceValue) : EXAMPLE_BALANCE}
            fileName={file?.name ?? exampleName}
          />
        </div>

        <ol className="space-y-3 lg:col-start-1">
          <li
            className={stepClass('flex')}
            onFocusCapture={() => setFocus('flex')}
            onMouseEnter={() => setFocus('flex')}
          >
            <StepNumber n={1} done={hasBalance} />
            <div className="min-w-0 flex-1">
              <label htmlFor="welcome-balance" className="block text-[15px] font-semibold">
                Fleksbalanse
              </label>
              <p className="mt-0.5 text-sm text-ink-muted">
                Tallet under <q>Flextime balance in total</q>.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <div className="relative w-32">
                  <input
                    id="welcome-balance"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder={EXAMPLE_BALANCE}
                    value={balance}
                    onChange={(e) => setBalance(e.target.value)}
                    aria-invalid={balanceInvalid || undefined}
                    aria-describedby="welcome-balance-start"
                    className={`${inputClass} tabular pr-7 text-base ${balanceInvalid ? 'border-negative' : ''}`}
                  />
                  <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-sm text-ink-subtle">
                    t
                  </span>
                </div>
                {balanceInvalid && <span className="text-sm text-negative">Skriv et tall</span>}
              </div>
              <p id="welcome-balance-start" className="mt-2.5 text-xs leading-relaxed text-ink-subtle">
                MyTime teller videre fra <DateButton value={effectiveStart} onChange={setStartDate} />
                {lastImported && startDate === null && ', uka etter den du importerer'}.
              </p>
            </div>
          </li>

          <li
            className={stepClass('import')}
            onFocusCapture={() => setFocus('import')}
            onMouseEnter={() => setFocus('import')}
          >
            <StepNumber n={2} done={hasImport} />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold">Importer en uke</p>
              <p className="mt-0.5 text-sm text-ink-muted">
                Trykk <span className="font-medium text-ink">EXPORT</span> og slipp filen her. Uka hentes fra
                datoene i filen.
              </p>

              {!file ? (
                <label
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    void choose(e.dataTransfer.files[0]);
                  }}
                  className={`mt-3 flex cursor-pointer items-center gap-3 rounded-lg border border-dashed px-3.5 py-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${
                    dragging
                      ? 'border-accent bg-accent-soft'
                      : 'border-line-strong hover:border-accent hover:bg-subtle'
                  }`}
                >
                  <Upload size={18} className="shrink-0 text-accent" />
                  <span className="text-sm">
                    <span className="font-medium">Velg fil</span>{' '}
                    <span className="text-ink-subtle">eller slipp den her</span>
                  </span>
                  <input
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="sr-only"
                    onChange={(e) => void choose(e.target.files?.[0])}
                  />
                </label>
              ) : (
                <FileResult
                  file={file}
                  preview={preview}
                  reading={reading}
                  error={fileError}
                  onClear={clearFile}
                />
              )}
            </div>
          </li>
        </ol>

        <footer className="lg:col-start-1">
          {error && (
            <p role="alert" className="mb-3 flex items-start gap-2 text-sm text-negative">
              <Alert className="mt-0.5 shrink-0" /> {error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              className="h-10 px-4 text-[15px]"
              disabled={saving || reading || (!hasBalance && !hasImport)}
              onClick={() => void finish(false)}
            >
              {saving && <Spinner className="h-3.5 w-3.5" />}
              {primaryLabel}
            </Button>
            <Button variant="ghost" className="h-10" disabled={saving} onClick={() => void finish(true)}>
              Hopp over
            </Button>
          </div>
          <p className="mt-3 text-xs text-ink-subtle">
            Dette kan endres senere
          </p>
        </footer>
      </div>
    </dialog>
  );
}

/** The date as plain text in the sentence; clicking opens the browser's own date picker. */
function DateButton({ value, onChange }: { value: string; onChange: (date: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => {
          const el = input.current;
          if (!el) return;
          try {
            el.showPicker();
          } catch {
            el.focus();
          }
        }}
        aria-label={`Fleks gjelder fra ${longDate(value)}. Endre dato`}
        className="welcome-date tabular"
      >
        {longDate(value)}
      </button>
      <input
        ref={input}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={value}
        onChange={(e) => onChange(e.target.value || null)}
        className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
      />
    </span>
  );
}

function StepNumber({ n, done }: { n: number; done: boolean }) {
  return (
    <span className={`welcome-num ${done ? 'welcome-num-done' : ''}`} aria-hidden="true">
      {done ? <Check size={14} strokeWidth={2.8} /> : n}
    </span>
  );
}

function FileResult({
  file,
  preview,
  reading,
  error,
  onClear,
}: {
  file: File;
  preview: ImportPreview | null;
  reading: boolean;
  error: string | null;
  onClear: () => void;
}) {
  const weeks = preview?.weeks ?? [];
  const skipped = preview?.errors.length ?? 0;

  return (
    <div className="mt-3 rounded-lg border border-line bg-subtle">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-ink-muted" title={file.name}>
          {file.name}
        </span>
        <button
          type="button"
          onClick={onClear}
          className="shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium text-ink-muted hover:bg-hover hover:text-ink"
        >
          Bytt fil
        </button>
      </div>
      <div className="px-3 py-2.5 text-sm">
        {reading && (
          <span className="flex items-center gap-2 text-ink-muted">
            <Spinner className="h-3.5 w-3.5" /> Leser filen …
          </span>
        )}
        {error && (
          <span className="flex items-start gap-2 text-negative">
            <Alert className="mt-0.5 shrink-0" /> {error}
          </span>
        )}
        {preview && weeks.length === 0 && <span className="text-ink-muted">Fant ingen timer i filen.</span>}
        {weeks.map((w) => (
          <div key={w.weekStart} className="flex items-baseline gap-2">
            <span className="font-semibold">Uke {isoWeekOf(w.weekStart).week}</span>
            <span className="text-ink-subtle tabular">
              {shortDate(w.weekStart)}–{shortDate(addDays(w.weekStart, 6))}
            </span>
            <span className="ml-auto text-ink-muted tabular">
              {w.lines.length} {w.lines.length === 1 ? 'linje' : 'linjer'} ·{' '}
              <span className="font-medium text-ink">{formatHours(w.totalHours)} t</span>
            </span>
          </div>
        ))}
        {skipped > 0 && (
          <p className="mt-1.5 text-xs text-warning">
            {skipped} {skipped === 1 ? 'rad' : 'rader'} hoppes over: {preview!.errors[0]!.message}
          </p>
        )}
      </div>
    </div>
  );
}
