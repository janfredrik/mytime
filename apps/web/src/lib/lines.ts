import { type Entry, type Line, type LineDescriptor, compareISODate, isMeaningfulEntry } from '@mytime/shared';

export function emptyEntry(date: string): Entry {
  return { date, hours: 0, comment: '', timeFrom: '', timeTo: '' };
}

export function entryFor(line: Line, date: string): Entry | undefined {
  return line.entries.find((e) => e.date === date);
}

export function setEntry(line: Line, date: string, patch: Partial<Entry>): Line {
  const next = { ...(entryFor(line, date) ?? emptyEntry(date)), ...patch, date };
  const others = line.entries.filter((e) => e.date !== date);
  return {
    ...line,
    entries: isMeaningfulEntry(next)
      ? [...others, next].sort((a, b) => compareISODate(a.date, b.date))
      : others,
  };
}

export function newLine(descriptor: LineDescriptor): Line {
  return { id: crypto.randomUUID(), ...descriptor, entries: [] };
}

export function describe(line: LineDescriptor): string {
  return [line.projectNumber, line.projectName, line.taskNumber, line.taskName, line.type]
    .filter(Boolean)
    .join(' · ');
}

export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}
