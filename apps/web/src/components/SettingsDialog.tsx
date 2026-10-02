import { type Settings, parseHours } from '@mytime/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Button, Dialog, Field, inputClass } from './ui';

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
          <Field label="Fleksbalanse ved start" hint="Kan være negativ.">
            <input
              className={inputClass}
              inputMode="decimal"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
            />
          </Field>
          <Field label="Startdato for fleks" hint="Tom = første uke med timer.">
            <input type="date" className={inputClass} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
        </div>
        {error && <p className="text-sm text-negative">{error}</p>}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
