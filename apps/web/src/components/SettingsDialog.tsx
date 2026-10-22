import { type Settings, parseHours } from '@mytime/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { type Density, useDensity } from '../lib/density';
import { type ThemePref, useTheme } from '../lib/theme';
import { Upload } from './icons';
import { Button, Dialog, Field, Spinner, inputClass } from './ui';

const themeOptions: { value: ThemePref; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'light', label: 'Lys' },
  { value: 'dark', label: 'Mørk' },
];

const densityOptions: { value: Density; label: string }[] = [
  { value: 'compact', label: 'Kompakt' },
  { value: 'comfortable', label: 'Luftig' },
];

/** Segmented radio group; the choice applies at once, like the theme. */
function Segmented<T extends string>({
  name,
  options,
  value,
  onChange,
}: {
  name: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-line-strong bg-subtle p-0.5">
      {options.map((o) => (
        <label
          key={o.value}
          className={`cursor-pointer rounded-md px-3 py-1 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
            value === o.value ? 'bg-surface font-medium text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
          }`}
        >
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
            className="sr-only"
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}

/** Admin only: replace the shared time code catalog with a new export. */
function CatalogUpload() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const upload = async (file: File) => {
    setBusy(true);
    setResult(null);
    try {
      const res = await api.uploadCatalog(file);
      await qc.invalidateQueries({ queryKey: ['catalog'] });
      const fmt = (n: number) => n.toLocaleString('nb-NO');
      setResult({ ok: true, text: `Katalogen er oppdatert: ${fmt(res.projects)} prosjekter og ${fmt(res.tasks)} oppgaver.` });
    } catch (err) {
      setResult({ ok: false, text: err instanceof Error ? err.message : 'Opplastingen feilet' });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="border-t border-line pt-4">
      <fieldset>
        <legend className="mb-1 block text-xs font-medium text-ink-muted">Timekodekatalog</legend>
        <p className="mb-2 text-xs text-ink-subtle">
          Last opp <code>mytime-timekoder.json</code>. Den erstatter hele katalogen for alle brukere.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        <Button onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? <Spinner /> : <Upload />} Last opp katalog
        </Button>
        {result && (
          <p role="status" className={`mt-2 text-sm ${result.ok ? 'text-ink-muted' : 'text-negative'}`}>
            {result.text}
          </p>
        )}
      </fieldset>
    </div>
  );
}

/** Delete every timecard and setting, then show the first-run welcome again. Asks before it does. */
function ResetAccount({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.resetAccount();
      onDone();
      await qc.resetQueries();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nullstillingen feilet');
      setBusy(false);
    }
  };

  return (
    <div className="border-t border-line pt-4">
      <fieldset>
        <legend className="mb-1 block text-xs font-medium text-ink-muted">Nullstill</legend>
        {!confirming ? (
          <>
            <p className="mb-2 text-xs text-ink-subtle">
              Slett alle timer og innstillinger og start på nytt med velkomstveiviseren.
            </p>
            <Button variant="danger" onClick={() => setConfirming(true)}>
              Nullstill…
            </Button>
          </>
        ) : (
          <div
            role="alert"
            ref={(el) => el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })}
            className="rounded-lg border border-negative bg-negative-soft p-3"
          >
            <p className="text-sm text-ink">
              Alle timelister, linjer og innstillinger slettes for godt. Dette kan ikke angres.
            </p>
            <div className="mt-3 flex gap-2">
              <Button variant="ghost" onClick={() => setConfirming(false)} disabled={busy} autoFocus>
                Avbryt
              </Button>
              <Button variant="danger" onClick={() => void reset()} disabled={busy}>
                {busy && <Spinner />} Ja, slett alt
              </Button>
            </div>
          </div>
        )}
        {error && <p className="mt-2 text-sm text-negative">{error}</p>}
      </fieldset>
    </div>
  );
}

export function SettingsDialog({
  open,
  settings,
  isAdmin,
  onClose,
}: {
  open: boolean;
  settings: Settings;
  isAdmin: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [theme, setTheme] = useTheme();
  const [density, setDensity] = useDensity();
  const [norm, setNorm] = useState('');
  const [balance, setBalance] = useState('');
  const [startDate, setStartDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNorm(String(settings.dailyNormHours).replace('.', ','));
    setBalance(String(settings.flexStartBalance).replace('.', ','));
    setStartDate(settings.flexStartDate ?? '');
    setError(null);
  }, [open, settings]);

  const save = async () => {
    const dailyNormHours = parseHours(norm);
    const flexStartBalance = parseHours(balance || '0');
    if (dailyNormHours === null || dailyNormHours < 0 || dailyNormHours > 24) {
      setError('Dagsnorm må være mellom 0 og 24 timer');
      return;
    }
    if (flexStartBalance === null) {
      setError('Ugyldig fleksbalanse');
      return;
    }
    setSaving(true);
    try {
      await api.saveSettings({ dailyNormHours, flexStartBalance, flexStartDate: startDate || null });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['me'] }),
        qc.invalidateQueries({ queryKey: ['flex'] }),
      ]);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lagring feilet');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Innstillinger"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Avbryt
          </Button>
          <Button variant="primary" onClick={save} disabled={saving}>
            Lagre
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field label="Dagsnorm (timer)" hint="Brukes for fleks og ukemål. Helg og helligdager har norm 0.">
          <input className={inputClass} inputMode="decimal" value={norm} onChange={(e) => setNorm(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fleksbalanse ved start">
            <input
              className={inputClass}
              inputMode="decimal"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
            />
          </Field>
          <Field label="Startdato for fleks">
            <input type="date" className={inputClass} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
        </div>
        <fieldset>
          <legend className="mb-1 block text-xs font-medium text-ink-muted">Utseende</legend>
          <Segmented name="theme" options={themeOptions} value={theme} onChange={setTheme} />
          <span className="mt-1 block text-xs text-ink-subtle">Auto følger systemet</span>
        </fieldset>
        <fieldset>
          <legend className="mb-1 block text-xs font-medium text-ink-muted">Radvisning</legend>
          <Segmented name="density" options={densityOptions} value={density} onChange={setDensity} />
        </fieldset>
        {error && <p className="text-sm text-negative">{error}</p>}
        {isAdmin && <CatalogUpload />}
        <ResetAccount key={String(open)} onDone={onClose} />
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
