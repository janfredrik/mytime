/** Hours for display in the Norwegian UI, e.g. 5.5 -> "5,5", 8 -> "8". */
export function formatHours(value: number): string {
  return new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 2 }).format(value).replace('−', '-');
}

/** Hours as written in the timecard export: at least one decimal, e.g. "5.0", "0.5", "0.25". */
export function formatHoursExport(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? rounded.toFixed(1) : String(rounded);
}

/** Parse user/file input like "5,5", "5.5", " 2 " into a number; null when empty or invalid. */
export function parseHours(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  const trimmed = input.trim().replace(',', '.');
  if (trimmed === '') return null;
  if (!/^-?\d*\.?\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}
