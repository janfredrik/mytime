import { type ImportPreview, type ImportPreviewWeek, addDays, formatHours, isoWeekOf } from '@mytime/shared';
import { useState } from 'react';
import { api } from '../lib/api';
import { dateTime, shortDate } from '../lib/format';
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

  const replacing = preview?.weeks.filter((w) => w.existingLines > 0).length ?? 0;
  const weekCount = preview?.weeks.length ?? 0;
  const commitLabel =
    replacing === 0
      ? weekCount > 1
        ? `Importer ${weekCount} uker`
        : 'Importer'
      : weekCount > 1
        ? `Importer ${weekCount} uker, erstatt ${replacing}`
        : `Erstatt uke ${isoWeekOf(preview!.weeks[0]!.weekStart).week}`;

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
            {commitLabel}
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
                      <ReplaceNote week={w} />
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

/** What committing would overwrite in a week. Already exported weeks get the strongest warning. */
function ReplaceNote({ week }: { week: ImportPreviewWeek }) {
  if (week.existingLines === 0) return <span className="text-ink-subtle">Ny uke</span>;
  const lines = `${week.existingLines} ${week.existingLines === 1 ? 'linje' : 'linjer'}`;
  return (
    <div className="space-y-0.5">
      <div className="text-warning">
        Erstatter {lines}
        {week.existingHours > 0 && <span className="tabular"> · {formatHours(week.existingHours)} t</span>}
      </div>
      {week.existingStatus !== 'draft' && week.existingExportedAt && (
        <div className="flex items-center gap-1 font-medium text-negative">
          <Alert size={12} className="shrink-0" />
          Eksportert {dateTime(week.existingExportedAt)}
        </div>
      )}
    </div>
  );
}
