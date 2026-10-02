import {
  type ImportIssue,
  type ImportedWeek,
  type Line,
  type LineDescriptor,
  MAX_HOURS_PER_ENTRY,
  compareISODate,
  formatISODate,
  isValidISODate,
  lineKey,
  parseHours,
  round2,
  weekStartOf,
} from '@mytime/shared';
import ExcelJS from 'exceljs';
import { randomUUID } from 'node:crypto';
import { COLUMNS, type ColumnKey, SHEET_NAME } from './columns.js';

export interface ParsedImport {
  weeks: ImportedWeek[];
  warnings: ImportIssue[];
  errors: ImportIssue[];
}

export const MAX_IMPORT_WEEKS = 60;

const HEADER_ALIASES: Record<string, ColumnKey> = Object.fromEntries([
  ...COLUMNS.map((c) => [normaliseHeader(c.header), c.key] as const),
  ['prosjektnummer', 'projectNumber'],
  ['prosjektnr', 'projectNumber'],
  ['prosjekt', 'projectNumber'],
  ['prosjektnavn', 'projectName'],
  ['oppgavenummer', 'taskNumber'],
  ['oppgavenr', 'taskNumber'],
  ['oppgave', 'taskNumber'],
  ['oppgavenavn', 'taskName'],
  ['dato', 'date'],
  ['timer', 'hours'],
  ['kommentar', 'comment'],
  ['fra', 'timeFrom'],
  ['til', 'timeTo'],
]);

function normaliseHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-zæøå]/g, '');
}

type CellValue = ExcelJS.CellValue;

/** Plain text of a cell regardless of how Excel stored it. */
function cellText(value: CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return formatISODate(value);
  if (typeof value === 'object') {
    if ('richText' in value) return value.richText.map((r) => r.text).join('');
    if ('text' in value && typeof value.text === 'string') return value.text;
    if ('result' in value) return cellText(value.result as CellValue);
  }
  return '';
}

function excelSerialToISO(serial: number): string {
  return formatISODate(new Date(Math.round((serial - 25569) * 86_400_000)));
}

function parseDate(value: CellValue): string | null | 'invalid' {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return formatISODate(value);
  if (typeof value === 'number') return excelSerialToISO(value);
  if (typeof value === 'object' && 'result' in value) return parseDate(value.result as CellValue);
  const text = cellText(value).trim();
  if (text === '') return null;
  let iso = text.slice(0, 10);
  const nb = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text);
  if (nb) iso = `${nb[3]}-${nb[2]!.padStart(2, '0')}-${nb[1]!.padStart(2, '0')}`;
  else if (/^\d+(\.\d+)?$/.test(text)) iso = excelSerialToISO(Number(text));
  return isValidISODate(iso) ? iso : 'invalid';
}

function parseTime(value: CellValue): string {
  if (value instanceof Date) return value.toISOString().slice(11, 16);
  return cellText(value).trim().slice(0, 20);
}

interface RawRow {
  row: number;
  descriptor: LineDescriptor;
  date: string | null;
  hours: number | null;
  comment: string;
  timeFrom: string;
  timeTo: string;
}

/**
 * Parse a timecard spreadsheet. Dated rows go to their own ISO week. Rows without a date
 * (lines without hours) go to the week the file covers when that is unambiguous, otherwise
 * to `fallbackWeekStart`.
 */
export async function parseTimecardXlsx(
  buffer: Buffer | ArrayBuffer,
  fallbackWeekStart: string,
): Promise<ParsedImport> {
  const warnings: ImportIssue[] = [];
  const errors: ImportIssue[] = [];
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as ArrayBuffer);
  } catch {
    return { weeks: [], warnings, errors: [{ row: 0, message: 'Filen er ikke en gyldig xlsx-fil' }] };
  }
  const sheet = workbook.getWorksheet(SHEET_NAME) ?? workbook.worksheets[0];
  if (!sheet) return { weeks: [], warnings, errors: [{ row: 0, message: 'Filen har ingen ark' }] };

  const columns = new Map<ColumnKey, number>();
  sheet.getRow(1).eachCell((cell, col) => {
    const key = HEADER_ALIASES[normaliseHeader(cellText(cell.value))];
    if (key && !columns.has(key)) columns.set(key, col);
  });
  if (!columns.has('projectNumber') && !columns.has('projectName')) {
    return {
      weeks: [],
      warnings,
      errors: [{ row: 1, message: 'Fant ikke kolonneoverskrifter (f.eks. «Project number»)' }],
    };
  }

  const raw: RawRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const get = (key: ColumnKey): CellValue => {
      const col = columns.get(key);
      return col === undefined ? null : row.getCell(col).value;
    };
    const text = (key: ColumnKey) => cellText(get(key)).trim();
    const descriptor: LineDescriptor = {
      projectNumber: text('projectNumber'),
      projectName: text('projectName'),
      taskNumber: text('taskNumber'),
      taskName: text('taskName'),
      type: text('type'),
    };
    if (Object.values(descriptor).every((v) => v === '')) return;

    const date = parseDate(get('date'));
    const hoursText = cellText(get('hours')).trim();
    const hours = parseHours(hoursText);
    const comment = cellText(get('comment')).replace(/\r\n/g, '\n').trim();

    if (date === 'invalid') {
      errors.push({ row: rowNumber, message: `Ugyldig dato «${cellText(get('date'))}»` });
      return;
    }
    if (hoursText !== '' && hours === null) {
      errors.push({ row: rowNumber, message: `Ugyldig timeantall «${hoursText}»` });
      return;
    }
    if (hours !== null && (hours < 0 || hours > MAX_HOURS_PER_ENTRY)) {
      errors.push({ row: rowNumber, message: `Timeantall må være mellom 0 og ${MAX_HOURS_PER_ENTRY}` });
      return;
    }
    if (date === null && (hours ?? 0) > 0) {
      errors.push({ row: rowNumber, message: 'Timer uten dato' });
      return;
    }
    raw.push({
      row: rowNumber,
      descriptor,
      date,
      hours,
      comment,
      timeFrom: parseTime(get('timeFrom')),
      timeTo: parseTime(get('timeTo')),
    });
  });

  const datedWeeks = new Set(raw.flatMap((r) => (r.date ? [weekStartOf(r.date)] : [])));
  const undatedWeek = datedWeeks.size === 1 ? [...datedWeeks][0]! : fallbackWeekStart;

  const weeks = new Map<string, Map<string, Line>>();
  for (const r of raw) {
    const weekStart = r.date ? weekStartOf(r.date) : undatedWeek;
    let lines = weeks.get(weekStart);
    if (!lines) weeks.set(weekStart, (lines = new Map()));
    const key = lineKey(r.descriptor);
    let line = lines.get(key);
    if (!line) lines.set(key, (line = { id: randomUUID(), ...r.descriptor, entries: [] }));
    if (!r.date) continue;

    const existing = line.entries.find((e) => e.date === r.date);
    if (existing) {
      existing.hours = round2(existing.hours + (r.hours ?? 0));
      existing.comment = [existing.comment, r.comment].filter(Boolean).join('\n');
      warnings.push({
        row: r.row,
        message: `Flere rader for samme linje og dato (${r.date}) – timene er slått sammen`,
      });
    } else {
      line.entries.push({
        date: r.date,
        hours: round2(r.hours ?? 0),
        comment: r.comment,
        timeFrom: r.timeFrom,
        timeTo: r.timeTo,
      });
    }
  }

  if (weeks.size > MAX_IMPORT_WEEKS) {
    return {
      weeks: [],
      warnings,
      errors: [...errors, { row: 0, message: `Filen dekker mer enn ${MAX_IMPORT_WEEKS} uker` }],
    };
  }

  return {
    weeks: [...weeks.entries()]
      .sort(([a], [b]) => compareISODate(a, b))
      .map(([weekStart, lines]) => ({
        weekStart,
        lines: [...lines.values()].map((l) => ({
          ...l,
          entries: l.entries.sort((a, b) => compareISODate(a.date, b.date)),
        })),
      })),
    warnings,
    errors,
  };
}
