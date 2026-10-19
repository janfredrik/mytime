import {
  type CatalogProject,
  type CatalogTask,
  type LineDescriptor,
  TEXT_LIMITS,
  joinNumberName,
  lineKey,
} from '@mytime/shared';
import { useQuery } from '@tanstack/react-query';
import { type KeyboardEvent, type ReactNode, useEffect, useId, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { CatalogPicker } from './CatalogPicker';
import { Search } from './icons';
import { Button, Dialog, Field, inputClass } from './ui';

const DEFAULT_TYPE = 'Normal -NO';

const EMPTY: LineDescriptor = {
  projectNumber: '',
  projectName: '',
  taskNumber: '',
  taskName: '',
  type: DEFAULT_TYPE,
};

/** The catalog changes rarely; one fetch per hour is plenty. */
export const CATALOG_STALE_MS = 60 * 60 * 1000;

const projectSearch = (p: CatalogProject) => `${p.number} ${p.name}`;
const projectKey = (p: CatalogProject) => p.id;
const renderProject = (p: CatalogProject) => (
  <div className="flex items-baseline gap-2">
    <span className="tabular shrink-0 text-xs text-ink-subtle">{p.number}</span>
    <span className="truncate">{p.name}</span>
  </div>
);

const taskSearch = (t: CatalogTask) => `${t.number} ${t.name} ${t.description}`;
const taskKey = (t: CatalogTask) => t.id;
const renderTask = (t: CatalogTask) => (
  <>
    <div className="truncate">{joinNumberName(t.number, t.name)}</div>
    {t.description && t.description !== t.name && (
      <div className="truncate text-xs text-ink-muted">{t.description}</div>
    )}
  </>
);

/** Copy only the descriptor fields; callers may pass a full `Line` with id and entries. */
function describe(line: LineDescriptor, map: (v: string) => string = (v) => v): LineDescriptor {
  return {
    projectNumber: map(line.projectNumber),
    projectName: map(line.projectName),
    taskNumber: map(line.taskNumber),
    taskName: map(line.taskName),
    type: map(line.type),
  };
}

/** A titled group in the dialog; the title only shows when there is more than one way to find a line. */
function Section({ title, hint, show, children }: { title: string; hint: string; show: boolean; children: ReactNode }) {
  const id = useId();
  if (!show) return <div className="space-y-4">{children}</div>;
  return (
    <section aria-labelledby={id} className="space-y-3">
      <div>
        <h3 id={id} className="text-sm font-semibold text-ink">
          {title}
        </h3>
        <p className="text-xs text-ink-subtle">{hint}</p>
      </div>
      {children}
    </section>
  );
}

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
  const [manual, setManual] = useState(false);
  const taskRef = useRef<HTMLInputElement>(null);
  const ids = useId();

  useEffect(() => {
    if (open) {
      setValue(initial ? describe(initial) : EMPTY);
      setQuery('');
      setActive(-1);
      setManual(false);
    }
  }, [open, initial]);

  const catalog = useQuery({
    queryKey: ['catalog', 'projects'],
    queryFn: api.catalogProjects,
    staleTime: CATALOG_STALE_MS,
  });
  const projects = useMemo(() => catalog.data ?? [], [catalog.data]);
  const hasCatalog = projects.length > 0;
  const hasSuggestions = suggestions.length > 0;
  // Two ways to find a line: name both so it is clear which list each search covers.
  const twoWays = hasSuggestions && hasCatalog;
  const project = useMemo(
    () => projects.find((p) => p.number === value.projectNumber.trim()),
    [projects, value.projectNumber],
  );
  const tasksQuery = useQuery({
    queryKey: ['catalog', 'tasks', project?.id],
    queryFn: () => api.catalogTasks(project!.id),
    staleTime: CATALOG_STALE_MS,
    enabled: open && project !== undefined,
  });
  const tasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data]);
  const task =
    tasks.find((t) => t.number === value.taskNumber.trim() && t.name === value.taskName.trim()) ??
    tasks.find((t) => t.number === value.taskNumber.trim());
  // Free-text fields: when there is no catalog, on request, or for a project the catalog lacks.
  const outsideCatalog = hasCatalog && value.projectNumber.trim() !== '' && !project;
  const showFields = !hasCatalog || manual || outsideCatalog;
  // Once shown, keep the fields while the user types, even if the number turns into a known one.
  useEffect(() => {
    if (outsideCatalog) setManual(true);
  }, [outsideCatalog]);

  const selectProject = (p: CatalogProject) => {
    setValue((prev) => ({
      ...prev,
      projectNumber: p.number,
      projectName: p.name,
      ...(p.number === prev.projectNumber.trim() ? {} : { taskNumber: '', taskName: '' }),
      type: prev.type.trim() || DEFAULT_TYPE,
    }));
    // Next step: the task. Wait for the render that shows the project's tasks.
    requestAnimationFrame(() => taskRef.current?.focus());
  };

  const selectTask = (t: CatalogTask) => {
    setValue((prev) => ({
      ...prev,
      taskNumber: t.number,
      taskName: t.name,
      type: prev.type.trim() || DEFAULT_TYPE,
    }));
  };

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
      type: distinct([DEFAULT_TYPE, ...suggestions.map((s) => s.type)]),
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

  const trimmed = describe(value, (v) => v.trim());
  if (!trimmed.type) trimmed.type = DEFAULT_TYPE;
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
      setValue(describe(s));
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
        maxLength={TEXT_LIMITS[key]}
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
        {hasSuggestions && (
          <Section title="Brukt før" hint="Linjer du har ført timer på tidligere" show={twoWays}>
            <div>
              <div className="relative">
                <Search size={15} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-subtle" />
                <input
                  className={`${inputClass} pl-8`}
                  placeholder={twoWays ? 'Søk i linjene dine…' : 'Søk i linjer du har brukt før…'}
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
                        onClick={() => setValue(describe(s))}
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
          </Section>
        )}

        {twoWays && (
          <div className="flex items-center gap-3 pt-1 text-xs text-ink-subtle" aria-hidden="true">
            <span className="h-px flex-1 bg-line" />
            eller finn noe nytt
            <span className="h-px flex-1 bg-line" />
          </div>
        )}

        <Section title="Alle prosjekter" hint="Søk i hele prosjektkatalogen" show={twoWays}>
          {hasCatalog && (
            <div className="space-y-3">
              <CatalogPicker
                label="Prosjekt"
                placeholder={twoWays ? 'Søk blant alle prosjekter…' : 'Søk på prosjektnummer eller navn…'}
                items={projects}
                emptyText="Katalogen er tom"
                selectedLabel={joinNumberName(value.projectNumber, value.projectName)}
                searchText={projectSearch}
                itemKey={projectKey}
                renderItem={renderProject}
                onSelect={selectProject}
                autoFocus={!initial && suggestions.length === 0}
              />
              <CatalogPicker
                label="Oppgave"
                placeholder={project ? 'Søk på oppgavenummer eller navn…' : 'Velg prosjekt først'}
                items={tasks}
                loading={tasksQuery.isPending && project !== undefined}
                emptyText={project ? 'Ingen oppgaver i katalogen for dette prosjektet' : 'Velg prosjekt først'}
                selectedLabel={task ? joinNumberName(task.number, task.name) : joinNumberName(value.taskNumber, value.taskName)}
                searchText={taskSearch}
                itemKey={taskKey}
                renderItem={renderTask}
                onSelect={selectTask}
                inputRef={taskRef}
              />
              {!showFields && (
                <button
                  type="button"
                  className="text-xs text-ink-muted underline-offset-2 hover:text-ink hover:underline"
                  onClick={() => setManual(true)}
                >
                  Finner du ikke prosjektet? Skriv inn selv
                </button>
              )}
            </div>
          )}

          {showFields && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_1fr]">
              {input('projectNumber', 'Prosjektnummer', '266411', !hasCatalog && (!!initial || suggestions.length === 0))}
              {input('projectName', 'Prosjektnavn')}
              {input('taskNumber', 'Oppgavenummer')}
              {input('taskName', 'Oppgavenavn')}
            </div>
          )}
          {input('type', 'Type', DEFAULT_TYPE)}
        </Section>
        {duplicate && (
          <p className="text-xs text-warning">En linje med samme prosjekt, oppgave og type finnes allerede denne uka.</p>
        )}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
