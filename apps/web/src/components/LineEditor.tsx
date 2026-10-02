import { type LineDescriptor, joinNumberName, lineKey } from '@mytime/shared';
import { type KeyboardEvent, useEffect, useId, useMemo, useState } from 'react';
import { Search } from './icons';
import { Button, Dialog, Field, inputClass } from './ui';

const EMPTY: LineDescriptor = {
  projectNumber: '',
  projectName: '',
  taskNumber: '',
  taskName: '',
  type: 'Normal -NO',
};

function distinct(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'nb'));
}

export function LineEditor({
  open,
  initial,
  suggestions,
  existingKeys,
  onSave,
  onDelete,
  onClose,
}: {
  open: boolean;
  /** Line being edited, or null when adding a new line. */
  initial: LineDescriptor | null;
  suggestions: LineDescriptor[];
  existingKeys: Set<string>;
  onSave: (line: LineDescriptor) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState<LineDescriptor>(EMPTY);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(-1);
  const ids = useId();

  useEffect(() => {
    if (open) {
      setValue(initial ?? EMPTY);
      setQuery('');
      setActive(-1);
    }
  }, [open, initial]);

  const lists = useMemo(
    () => ({
      projectNumber: distinct(suggestions.map((s) => s.projectNumber)),
      projectName: distinct(suggestions.map((s) => s.projectName)),
      taskNumber: distinct(
        suggestions
          .filter((s) => !value.projectNumber || s.projectNumber === value.projectNumber)
          .map((s) => s.taskNumber),
      ),
      taskName: distinct(
        suggestions
          .filter((s) => !value.projectNumber || s.projectNumber === value.projectNumber)
          .map((s) => s.taskName),
      ),
      type: distinct(['Normal -NO', ...suggestions.map((s) => s.type)]),
    }),
    [suggestions, value.projectNumber],
  );

  const matches = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    return suggestions
      .filter((s) => {
        const text = Object.values(s).join(' ').toLowerCase();
        return terms.every((t) => text.includes(t));
      })
      .slice(0, 8);
  }, [query, suggestions]);

  const set = (key: keyof LineDescriptor, v: string) => {
    setValue((prev) => {
      const next = { ...prev, [key]: v };
      // Fill in names when a known number is chosen.
      if (key === 'projectNumber' && !prev.projectName) {
        const hit = suggestions.find((s) => s.projectNumber === v);
        if (hit) next.projectName = hit.projectName;
      }
      if (key === 'taskNumber' && !prev.taskName) {
        const hit = suggestions.find((s) => s.taskNumber === v && s.projectNumber === next.projectNumber);
        if (hit) next.taskName = hit.taskName;
      }
      return next;
    });
  };

  const trimmed = Object.fromEntries(
    Object.entries(value).map(([k, v]) => [k, v.trim()]),
  ) as unknown as LineDescriptor;
  const valid = trimmed.projectNumber !== '' || trimmed.projectName !== '';
  const duplicate =
    existingKeys.has(lineKey(trimmed)) && (!initial || lineKey(initial) !== lineKey(trimmed));

  const submit = () => {
    if (!valid) return;
    onSave(trimmed);
    onClose();
  };

  /** Pick a suggestion: add it straight away, unless the week already has that line. */
  const pick = (s: LineDescriptor) => {
    if (existingKeys.has(lineKey(s)) && (!initial || lineKey(initial) !== lineKey(s))) {
      setValue(s);
      return;
    }
    onSave(s);
    onClose();
  };

  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (matches.length === 0) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (i + step + matches.length) % matches.length);
    } else if (e.key === 'Enter' && matches[active]) {
      e.preventDefault();
      pick(matches[active]!);
    }
  };

  const input = (key: keyof LineDescriptor, label: string, placeholder?: string, autoFocus?: boolean) => (
    <Field label={label}>
      <input
        className={inputClass}
        value={value[key]}
        list={`${ids}-${key}`}
        placeholder={placeholder}
        data-autofocus={autoFocus || undefined}
        onChange={(e) => set(key, e.target.value)}
      />
      <datalist id={`${ids}-${key}`}>
        {lists[key].map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
    </Field>
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={initial ? 'Rediger linje' : 'Ny linje'}
      footer={
        <>
          {initial && onDelete && (
            <Button
              variant="danger"
              className="mr-auto"
              onClick={() => {
                onClose();
                onDelete();
              }}
            >
              Slett linje
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Avbryt
          </Button>
          <Button variant="primary" onClick={submit} disabled={!valid}>
            {initial ? 'Lagre' : 'Legg til'}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="space-y-4"
      >
        {suggestions.length > 0 && (
          <div>
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-subtle" />
              <input
                className={`${inputClass} pl-8`}
                placeholder="Søk i linjer du har brukt før…"
                aria-label="Søk i linjer du har brukt før"
                role="combobox"
                aria-expanded="true"
                aria-controls={`${ids}-matches`}
                aria-activedescendant={matches[active] ? `${ids}-match-${active}` : undefined}
                value={query}
                data-autofocus={!initial || undefined}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(e.target.value.trim() ? 0 : -1);
                }}
                onKeyDown={onSearchKey}
              />
            </div>
            <ul
              id={`${ids}-matches`}
              role="listbox"
              aria-label="Tidligere linjer"
              className="mt-2 max-h-56 divide-y divide-line overflow-y-auto rounded-lg border border-line"
            >
              {matches.length === 0 && <li className="px-3 py-2 text-sm text-ink-subtle">Ingen treff</li>}
              {matches.map((s, i) => {
                const key = lineKey(s);
                const selected = key === lineKey(trimmed);
                return (
                  <li key={key} id={`${ids}-match-${i}`} role="option" aria-selected={i === active}>
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setValue(s)}
                      onDoubleClick={() => pick(s)}
                      onMouseEnter={() => setActive(i)}
                      className={`block w-full px-3 py-2 text-left text-sm ${
                        i === active ? 'bg-hover' : ''
                      } ${selected ? 'bg-accent-soft' : ''}`}
                    >
                      <div className="flex items-baseline gap-2">
                        <span className="truncate font-medium">{s.projectName || s.projectNumber}</span>
                        <span className="tabular text-xs text-ink-subtle">{s.projectNumber}</span>
                        {existingKeys.has(key) && (
                          <span className="ml-auto shrink-0 text-xs text-ink-subtle">i uka</span>
                        )}
                      </div>
                      <div className="truncate text-xs text-ink-muted">
                        {joinNumberName(s.taskNumber, s.taskName)} · {s.type}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
            {!initial && (
              <p className="mt-1.5 text-xs text-ink-subtle">
                <kbd>↑</kbd> <kbd>↓</kbd> velger, <kbd>Enter</kbd> legger til linjen (eller dobbeltklikk).
              </p>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_1fr]">
          {input('projectNumber', 'Prosjektnummer', '266411', !!initial || suggestions.length === 0)}
          {input('projectName', 'Prosjektnavn')}
          {input('taskNumber', 'Oppgavenummer')}
          {input('taskName', 'Oppgavenavn')}
        </div>
        {input('type', 'Type', 'Normal -NO')}
        {duplicate && (
          <p className="text-xs text-warning">En linje med samme prosjekt, oppgave og type finnes allerede denne uka.</p>
        )}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
