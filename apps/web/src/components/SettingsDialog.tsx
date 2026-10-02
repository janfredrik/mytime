import { type Settings, parseHours } from '@mytime/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { type ThemePref, useTheme } from '../lib/theme';
import { Button, Dialog, Field, inputClass } from './ui';

const themeOptions: { value: ThemePref; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'light', label: 'Lys' },
  { value: 'dark', label: 'Mørk' },
];

export function SettingsDialog({
  open,
  settings,
  onClose,
}: {
  open: boolean;
  settings: Settings;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [theme, setTheme] = useTheme();
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
          <div className="inline-flex rounded-lg border border-line-strong bg-subtle p-0.5">
            {themeOptions.map((o) => (
              <label
                key={o.value}
                className={`cursor-pointer rounded-md px-3 py-1 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
                  theme === o.value ? 'bg-surface font-medium text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
                }`}
              >
                <input
                  type="radio"
                  name="theme"
                  value={o.value}
                  checked={theme === o.value}
                  onChange={() => setTheme(o.value)}
                  className="sr-only"
                />
                {o.label}
              </label>
            ))}
          </div>
          <span className="mt-1 block text-xs text-ink-subtle">Auto følger systemet</span>
        </fieldset>
        {error && <p className="text-sm text-negative">{error}</p>}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
