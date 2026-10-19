import { type KeyboardEvent, type ReactNode, type Ref, useEffect, useId, useMemo, useRef, useState } from 'react';
import { inputClass } from './ui';

/** Rows rendered at once; the project list has thousands of entries. */
const LIMIT = 50;

/**
 * Searchable list for picking one entry from the time code catalog. Shows the chosen entry
 * while idle; focusing it opens the list and typing narrows it down (all words must match).
 */
export function CatalogPicker<T>({
  label,
  placeholder,
  items,
  loading = false,
  emptyText,
  selectedLabel,
  searchText,
  itemKey,
  renderItem,
  onSelect,
  inputRef,
  autoFocus,
}: {
  label: string;
  placeholder: string;
  items: readonly T[];
  loading?: boolean;
  emptyText: string;
  /** Text shown in the field while it is not being searched. */
  selectedLabel: string;
  searchText: (item: T) => string;
  itemKey: (item: T) => string | number;
  renderItem: (item: T) => ReactNode;
  onSelect: (item: T) => void;
  inputRef?: Ref<HTMLInputElement>;
  autoFocus?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const ids = useId();

  const index = useMemo(() => items.map((item) => searchText(item).toLowerCase()), [items, searchText]);
  const { matches, total } = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const hits: T[] = [];
    let count = 0;
    items.forEach((item, i) => {
      if (terms.every((t) => index[i]!.includes(t))) {
        count++;
        if (hits.length < LIMIT) hits.push(item);
      }
    });
    return { matches: hits, total: count };
  }, [items, index, query]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const choose = (item: T) => {
    setOpen(false);
    setQuery('');
    onSelect(item);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) setOpen(true);
      if (matches.length === 0) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (i + step + matches.length) % matches.length);
    } else if (e.key === 'Enter' && open) {
      // Enter picks from the list; it never submits the form while the list is open.
      e.preventDefault();
      if (matches[active]) choose(matches[active]);
    } else if (e.key === 'Escape' && open) {
      // Close the list, not the dialog.
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      setQuery('');
    }
  };

  return (
    <div>
      <label htmlFor={`${ids}-input`} className="mb-1 block text-xs font-medium text-ink-muted">
        {label}
      </label>
      <input
        id={`${ids}-input`}
        ref={inputRef}
        className={inputClass}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${ids}-list`}
        aria-autocomplete="list"
        aria-activedescendant={open && matches[active] ? `${ids}-option-${active}` : undefined}
        autoComplete="off"
        placeholder={placeholder}
        data-autofocus={autoFocus || undefined}
        value={open ? query : selectedLabel}
        onFocus={() => {
          setOpen(true);
          setQuery('');
          setActive(0);
        }}
        onBlur={() => {
          setOpen(false);
          setQuery('');
        }}
        onChange={(e) => {
          setOpen(true);
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={onKey}
      />
      {open && (
        <ul
          ref={listRef}
          id={`${ids}-list`}
          role="listbox"
          aria-label={label}
          className="mt-2 max-h-64 divide-y divide-line overflow-y-auto rounded-lg border border-line"
        >
          {loading && <li className="px-3 py-2 text-sm text-ink-subtle">Laster…</li>}
          {!loading && matches.length === 0 && (
            <li className="px-3 py-2 text-sm text-ink-subtle">{items.length ? 'Ingen treff' : emptyText}</li>
          )}
          {matches.map((item, i) => (
            <li
              key={itemKey(item)}
              id={`${ids}-option-${i}`}
              data-index={i}
              role="option"
              aria-selected={i === active}
              // Keep focus in the field so the click lands before the list closes on blur.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(item)}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-2 text-sm ${i === active ? 'bg-hover' : ''}`}
            >
              {renderItem(item)}
            </li>
          ))}
          {total > matches.length && (
            <li className="px-3 py-2 text-xs text-ink-subtle">
              Viser {matches.length} av {total} treff. Skriv mer for å snevre inn.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
