import { type Entry, TEXT_LIMITS, formatHours, parseHours } from '@mytime/shared';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { dayName, longDate } from '../lib/format';
import { Button, Field, inputClass } from './ui';

/** Details for one cell: hours, comment and optional time from/to. */
export function EntryPopover({
  anchor,
  entry,
  dayIndex,
  title,
  onSave,
  onClose,
}: {
  anchor: HTMLElement;
  entry: Entry;
  dayIndex: number;
  title: string;
  onSave: (patch: Partial<Entry>) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [hoursText, setHoursText] = useState(entry.hours ? formatHours(entry.hours) : '');
  const [comment, setComment] = useState(entry.comment);
  const [timeFrom, setTimeFrom] = useState(entry.timeFrom);
  const [timeTo, setTimeTo] = useState(entry.timeTo);
  const hours = parseHours(hoursText);
  const invalid = hoursText.trim() !== '' && (hours === null || hours < 0 || hours > 24);

  useLayoutEffect(() => {
    const rect = anchor.getBoundingClientRect();
    const width = 320;
    const height = ref.current?.offsetHeight ?? 300;
    let left = Math.min(rect.left, window.innerWidth - width - 12);
    left = Math.max(12, left);
    let top = rect.bottom + 6;
    if (top + height > window.innerHeight - 12) top = Math.max(12, rect.top - height - 6);
    setPos({ top, left });
  }, [anchor]);

  /** Close and hand focus back to the cell, so keyboard work continues where it left off. */
  const dismiss = () => {
    onClose();
    anchor.focus();
  };

  useEffect(() => {
    // Clicking elsewhere closes without stealing focus from whatever was clicked.
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        anchor.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [anchor, onClose]);

  const save = () => {
    if (invalid) return;
    onSave({ hours: hours ?? 0, comment: comment.trim(), timeFrom, timeTo });
    dismiss();
  };

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={`Detaljer ${longDate(entry.date)}`}
      style={{ top: pos.top, left: pos.left, width: 320 }}
      className="fixed z-50 rounded-xl border border-line bg-surface p-4 shadow-2xl"
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save();
        if (e.key === 'Tab') {
          // Keep Tab inside the popover while it is open.
          const focusable = [...e.currentTarget.querySelectorAll<HTMLElement>('input, textarea, button:not(:disabled)')];
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      }}
    >
      <div className="mb-3">
        <div className="text-sm font-semibold">
          {dayName(dayIndex)} {longDate(entry.date)}
        </div>
        <div className="truncate text-xs text-ink-muted" title={title}>
          {title}
        </div>
      </div>
      <div className="space-y-3">
        <Field label="Timer">
          <input
            // With hours already in place, the reason to open the popover is the comment.
            autoFocus={!entry.hours}
            inputMode="decimal"
            className={`${inputClass} tabular ${invalid ? 'border-negative' : ''}`}
            value={hoursText}
            onChange={(e) => setHoursText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                save();
              }
            }}
            aria-invalid={invalid}
            aria-describedby={invalid ? 'entry-hours-error' : undefined}
          />
          {invalid && (
            <span id="entry-hours-error" className="mt-1 block text-xs text-negative">
              Skriv timer mellom 0 og 24, f.eks. 7,5
            </span>
          )}
        </Field>
        <Field label="Kommentar">
          <textarea
            autoFocus={!!entry.hours}
            onFocus={(e) => {
              const end = e.currentTarget.value.length;
              e.currentTarget.setSelectionRange(end, end);
            }}
            rows={4}
            className={`${inputClass} resize-y`}
            value={comment}
            maxLength={TEXT_LIMITS.comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Hva ble gjort?"
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Fra">
            <input type="time" className={inputClass} value={timeFrom} onChange={(e) => setTimeFrom(e.target.value)} />
          </Field>
          <Field label="Til">
            <input type="time" className={inputClass} value={timeTo} onChange={(e) => setTimeTo(e.target.value)} />
          </Field>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-end gap-2">
        <span className="mr-auto text-xs text-ink-subtle">
          <kbd>{navigator.platform.startsWith('Mac') ? '⌘' : 'Ctrl'}</kbd>+<kbd>Enter</kbd> lagrer
        </span>
        <Button variant="ghost" onClick={dismiss}>
          Avbryt
        </Button>
        <Button variant="primary" onClick={save} disabled={invalid}>
          Lagre
        </Button>
      </div>
    </div>,
    document.body,
  );
}
