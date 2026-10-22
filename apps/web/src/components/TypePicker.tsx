import { TEXT_LIMITS, type TimeType, findTimeType } from '@mytime/shared';
import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import { inputClass } from './ui';

const OWN_GROUP = 'Andre typer du har brukt';

/**
 * Type field: free text, with the given types listed by group below it while focused.
 * Types the user has used before that are not standard are listed last.
 */
export function TypePicker({
  value,
  types,
  used,
  placeholder,
  onChange,
}: {
  value: string;
  /** Known types to offer, e.g. the standard ones or the project's own. */
  types: readonly TimeType[];
  /** Types from the user's earlier lines. */
  used: string[];
  placeholder?: string;
  onChange: (type: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // Narrow the list only once the user types; on focus the field holds the current type.
  const [filtering, setFiltering] = useState(false);
  const [active, setActive] = useState(-1);
  const listRef = useRef<HTMLUListElement>(null);
  const ids = useId();

  const all = useMemo<TimeType[]>(
    () => [
      ...types,
      ...used
        .filter((name) => !findTimeType(name))
        .map((name) => ({ name, description: '', group: OWN_GROUP })),
    ],
    [types, used],
  );
  const matches = useMemo(() => {
    if (!filtering) return all;
    const terms = value.toLowerCase().split(/\s+/).filter(Boolean);
    return all.filter((t) => {
      const text = `${t.name} ${t.description} ${t.group}`.toLowerCase();
      return terms.every((term) => text.includes(term));
    });
  }, [all, filtering, value]);
  const chosen = findTimeType(value);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const choose = (t: TimeType) => {
    setOpen(false);
    onChange(t.name);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) setOpen(true);
      if (matches.length === 0) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (i < 0 && step < 0 ? matches.length - 1 : (i + step + matches.length) % matches.length));
    } else if (e.key === 'Enter' && open) {
      // Enter picks from the list, or just keeps the typed text; it never submits while open.
      e.preventDefault();
      if (matches[active]) choose(matches[active]);
      else setOpen(false);
    } else if (e.key === 'Escape' && open) {
      // Close the list, not the dialog.
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <div>
      <label htmlFor={`${ids}-input`} className="mb-1 block text-xs font-medium text-ink-muted">
        Type
      </label>
      <input
        id={`${ids}-input`}
        className={inputClass}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${ids}-list`}
        aria-autocomplete="list"
        aria-activedescendant={open && matches[active] ? `${ids}-option-${active}` : undefined}
        autoComplete="off"
        maxLength={TEXT_LIMITS.type}
        placeholder={placeholder}
        value={value}
        onFocus={() => {
          setOpen(true);
          setFiltering(false);
          setActive(all.findIndex((t) => t.name === value.trim()));
        }}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          setOpen(true);
          setFiltering(true);
          setActive(-1);
          onChange(e.target.value);
        }}
        onKeyDown={onKey}
      />
      {open && (
        <ul
          ref={listRef}
          id={`${ids}-list`}
          role="listbox"
          aria-label="Type"
          className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-line"
        >
          {matches.length === 0 && (
            <li className="px-3 py-2 text-sm text-ink-subtle">Ingen standardtype passer. Teksten brukes som den er.</li>
          )}
          {matches.map((t, i) => (
            <li
              key={t.name}
              id={`${ids}-option-${i}`}
              data-index={i}
              role="option"
              aria-selected={i === active}
              // Keep focus in the field so the click lands before the list closes on blur.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(t)}
              onMouseEnter={() => setActive(i)}
              className="cursor-pointer"
            >
              {t.group !== matches[i - 1]?.group && (
                <div className={`bg-subtle px-3 pt-2 pb-1 text-xs font-semibold text-ink-subtle ${i > 0 ? 'border-t border-line' : ''}`}>
                  {t.group}
                </div>
              )}
              <div className={`px-3 py-2 text-sm ${i === active ? 'bg-hover' : ''} ${t.name === value.trim() ? 'bg-accent-soft' : ''}`}>
                <div className="flex items-baseline gap-2">
                  <span className="truncate">{t.name}</span>
                  {t.timeRange && <span className="ml-auto shrink-0 text-xs text-warning">Krever fra–til</span>}
                </div>
                {t.description && <div className="truncate text-xs text-ink-muted">{t.description}</div>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {!open && chosen?.timeRange && (
        <p className="mt-1.5 text-xs text-warning">
          Denne typen krever fra- og til-tid i gamle MyTime. Det føres ikke her, så legg det inn der.
        </p>
      )}
    </div>
  );
}
