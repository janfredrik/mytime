import { type ImportPreview, addDays, formatHours, isoWeekOf } from '@mytime/shared';
import { useState } from 'react';
import { api } from '../lib/api';
import { shortDate } from '../lib/format';
import { Alert, Upload } from './icons';
import { Button, Dialog, Spinner } from './ui';

export function ImportDialog({
  open,
  weekStart,
  onClose,
  beforeCommit,
  onImported,
}: {
  open: boolean;
  weekStart: string;
  onClose: () => void;
  beforeCommit: () => Promise<void>;
  onImported: (weekStarts: string[]) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setError(null);
    setBusy(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const choose = async (f: File | undefined) => {
    if (!f) return;
    setFile(f);
    setPreview(null);
    setError(null);
    setBusy(true);
    try {
      setPreview(await api.importPreview(weekStart, f));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke lese filen');
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      await beforeCommit();
      await api.importCommit({
        weeks: preview.weeks.map((w) => ({ weekStart: w.weekStart, lines: w.lines })),
      });
      onImported(preview.weeks.map((w) => w.weekStart));
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Importen feilet');
      setBusy(false);
    }
  };

  const issues = preview ? [...preview.errors.map((i) => ({ ...i, kind: 'error' as const })), ...preview.warnings.map((i) => ({ ...i, kind: 'warning' as const }))] : [];

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Importer timer fra Excel"
      wide
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Avbryt
          </Button>
          <Button variant="primary" onClick={commit} disabled={!preview || preview.weeks.length === 0 || busy}>
            {busy && preview ? <Spinner /> : null}
            Importer {preview && preview.weeks.length > 1 ? `${preview.weeks.length} uker` : ''}
          </Button>
        </>
      }
    >
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
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
          dragging ? 'border-accent bg-accent-soft' : 'border-line-strong hover:border-accent hover:bg-subtle'
        }`}
      >
        <Upload size={24} className="text-accent" />
        <span className="text-sm font-medium">{file ? file.name : 'Velg eller slipp en .xlsx-fil her'}</span>
        <span className="text-xs text-ink-subtle">
          Samme format som eksporten fra timesystemet (arket «Timecard»)
        </span>
        <input
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          onChange={(e) => void choose(e.target.files?.[0])}
        />
      </label>

      {busy && !preview && (
        <div className="mt-4 flex items-center gap-2 text-sm text-ink-muted">
          <Spinner /> Leser filen…
        </div>
      )}

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-negative-soft px-3 py-2 text-sm text-negative">
          <Alert className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {preview && (
        <div className="mt-5 space-y-4">
          {preview.weeks.length === 0 ? (
            <p className="text-sm text-ink-muted">Fant ingen linjer å importere.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-muted">
                  <th className="py-2 font-medium">Uke</th>
                  <th className="py-2 text-right font-medium">Linjer</th>
                  <th className="py-2 text-right font-medium">Timer</th>
                  <th className="py-2 pl-4 font-medium">Merknad</th>
                </tr>
              </thead>
              <tbody>
                {preview.weeks.map((w) => (
                  <tr key={w.weekStart} className="border-b border-line last:border-0">
                    <td className="py-2">
                      <span className="font-medium">Uke {isoWeekOf(w.weekStart).week}</span>{' '}
                      <span className="text-ink-subtle tabular">
                        {shortDate(w.weekStart)}–{shortDate(addDays(w.weekStart, 6))}
                      </span>
                    </td>
                    <td className="tabular py-2 text-right">{w.lines.length}</td>
                    <td className="tabular py-2 text-right font-medium">{formatHours(w.totalHours)}</td>
                    <td className="py-2 pl-4 text-xs">
                      {w.existingLines > 0 ? (
                        <span className="text-warning">Erstatter {w.existingLines} eksisterende linjer</span>
                      ) : (
                        <span className="text-ink-subtle">Ny uke</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {issues.length > 0 && (
            <div>
              <h3 className="mb-1.5 text-xs font-semibold text-ink-muted">
                {preview.errors.length > 0 && `${preview.errors.length} rader hoppes over`}
                {preview.errors.length > 0 && preview.warnings.length > 0 && ' · '}
                {preview.warnings.length > 0 && `${preview.warnings.length} advarsler`}
              </h3>
              <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
                {issues.map((i, n) => (
                  <li key={n} className={i.kind === 'error' ? 'text-negative' : 'text-warning'}>
                    {i.row > 0 ? `Rad ${i.row}: ` : ''}
                    {i.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
