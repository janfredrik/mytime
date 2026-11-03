import type { Line } from '@mytime/shared';
import { describe as group, expect, it } from 'vitest';
import { describe, entryFor, moveItem, newLine, setEntry } from '../src/lib/lines.js';

const line = (entries: Line['entries'] = []): Line => ({
  id: '00000000-0000-4000-8000-000000000001',
  projectNumber: '1001',
  projectName: 'Prosjekt',
  taskNumber: '01',
  taskName: 'Oppgave',
  type: 'Normal',
  entries,
});

const entry = (date: string, hours: number) => ({ date, hours, comment: '', timeFrom: '', timeTo: '' });

group('setEntry', () => {
  it('adds a new entry and keeps the entries sorted by date', () => {
    const next = setEntry(line([entry('2026-09-30', 2)]), '2026-09-28', { hours: 7.5 });
    expect(next.entries.map((e) => e.date)).toEqual(['2026-09-28', '2026-09-30']);
    expect(entryFor(next, '2026-09-28')?.hours).toBe(7.5);
  });

  it('patches an existing entry without losing its other fields', () => {
    const start = line([{ ...entry('2026-09-28', 4), comment: 'Møte' }]);
    const next = setEntry(start, '2026-09-28', { hours: 6 });
    expect(next.entries).toEqual([{ ...entry('2026-09-28', 6), comment: 'Møte' }]);
  });

  it('drops an entry that becomes empty', () => {
    const next = setEntry(line([entry('2026-09-28', 4)]), '2026-09-28', { hours: 0 });
    expect(next.entries).toEqual([]);
  });

  it('keeps a zero-hour entry that still has a comment', () => {
    const next = setEntry(line(), '2026-09-28', { comment: 'Syk barn' });
    expect(next.entries).toHaveLength(1);
  });

  it('never moves an entry to another date through the patch', () => {
    const next = setEntry(line(), '2026-09-28', { hours: 1, date: '2026-10-01' });
    expect(next.entries[0]?.date).toBe('2026-09-28');
  });

  it('does not mutate the original line', () => {
    const start = line([entry('2026-09-28', 4)]);
    setEntry(start, '2026-09-28', { hours: 8 });
    expect(start.entries[0]?.hours).toBe(4);
  });
});

group('newLine', () => {
  it('gives each line its own id and no entries', () => {
    const descriptor = { projectNumber: '1', projectName: '', taskNumber: '', taskName: '', type: '' };
    const a = newLine(descriptor);
    const b = newLine(descriptor);
    expect(a.id).not.toBe(b.id);
    expect(a.entries).toEqual([]);
  });
});

group('describe', () => {
  it('joins the filled-in fields', () => {
    expect(describe({ ...line(), taskNumber: '', taskName: '' })).toBe('1001 · Prosjekt · Normal');
  });
});

group('moveItem', () => {
  it('moves an item to a new position', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
  });

  it('leaves the list alone when the target is out of range', () => {
    const items = ['a', 'b'];
    expect(moveItem(items, 0, -1)).toBe(items);
    expect(moveItem(items, 1, 2)).toBe(items);
  });
});
