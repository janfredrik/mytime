import { readFileSync } from 'node:fs';
import { unzipSync, strFromU8 } from 'fflate';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildTimecardXlsx, exportFileName, timecardRows } from '../src/xlsx/export.js';
import { parseTimecardXlsx } from '../src/xlsx/import.js';

const fixture = readFileSync(new URL('./fixtures/week40-sample.xlsx', import.meta.url));
const WEEK = '2026-09-28';

describe('import of the existing system export', () => {
  it('reads all lines into week 40, including lines without hours', async () => {
    const result = await parseTimecardXlsx(fixture, '2026-10-05');
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.weeks).toHaveLength(1);
    const [week] = result.weeks;
    expect(week!.weekStart).toBe(WEEK);
    expect(week!.lines).toHaveLength(21);

    const lunch = week!.lines[0]!;
    expect(lunch).toMatchObject({
      projectNumber: '266411',
      taskNumber: '4',
      taskName: 'Lunch',
      type: 'Normal -NO',
    });
    expect(lunch.entries.map((e) => [e.date, e.hours])).toEqual([
      ['2026-09-28', 0.5],
      ['2026-09-29', 0.5],
      ['2026-09-30', 0.5],
      ['2026-10-01', 0.5],
    ]);

    const empty = week!.lines[1]!;
    expect(empty).toMatchObject({ projectNumber: '244067', taskNumber: '01', entries: [] });

    const withComment = week!.lines.find((l) => l.taskNumber === '12.02 Senior')!;
    expect(withComment.entries[0]!.comment).toBe('Kundemøte\nDokumentasjon\nTilganger');

    const amp = week!.lines.find((l) => l.projectName.includes('&'));
    expect(amp?.projectName).toBe('Kunde I & Co - CAT');

    const total = week!.lines.flatMap((l) => l.entries).reduce((s, e) => s + e.hours, 0);
    expect(total).toBe(32);
  });

  it('round-trips: export of an import reproduces the original sheet', async () => {
    const { weeks } = await parseTimecardXlsx(fixture, WEEK);
    const exported = buildTimecardXlsx(weeks[0]!.lines, new Date('2026-10-02T11:02:56Z'));

    const original = strFromU8(unzipSync(new Uint8Array(fixture))['xl/worksheets/sheet1.xml']!);
    const ours = strFromU8(unzipSync(exported)['xl/worksheets/sheet1.xml']!);
    const sheetData = (xml: string) => xml.slice(xml.indexOf('<sheetData>'), xml.indexOf('</sheetData>'));
    expect(sheetData(ours)).toBe(sheetData(original));
    expect(ours).toContain('<dimension ref="A1:E31">');

    const again = await parseTimecardXlsx(Buffer.from(exported), WEEK);
    expect(again.weeks[0]!.lines.map(({ id: _id, ...l }) => l)).toEqual(
      weeks[0]!.lines.map(({ id: _id, ...l }) => l),
    );
  });

  it('is readable by a spreadsheet library with sheet name and headers', async () => {
    const { weeks } = await parseTimecardXlsx(fixture, WEEK);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(buildTimecardXlsx(weeks[0]!.lines)) as unknown as ArrayBuffer);
    const sheet = wb.getWorksheet('Timecard')!;
    expect(sheet.getRow(1).values).toEqual([
      undefined,
      'Project number',
      'Project name',
      'Task number',
      'Task name',
      'Type',
      'Date',
      'Hours',
      'Comment',
      'Time from',
      'Time to',
    ]);
  });

  it('writes empty lines as A–E only', () => {
    const rows = timecardRows([
      {
        id: '00000000-0000-4000-8000-000000000000',
        projectNumber: '1',
        projectName: 'P',
        taskNumber: '2',
        taskName: 'T',
        type: 'Normal -NO',
        entries: [],
      },
    ]);
    expect(rows).toEqual([['1', 'P', '2', 'T', 'Normal -NO']]);
  });

  it('names the file like the existing system', () => {
    expect(exportFileName(WEEK, new Date('2026-10-02T11:02:56Z'))).toBe(
      'week40_02102026130256.xlsx',
    );
  });
});

describe('tolerant import', () => {
  async function workbook(rows: unknown[][], headers?: string[]) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Ark1');
    ws.addRow(
      headers ?? ['Project number', 'Project name', 'Task number', 'Task name', 'Type', 'Date', 'Hours', 'Comment'],
    );
    for (const r of rows) ws.addRow(r);
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  it('accepts numbers, real dates, Norwegian dates and comma decimals', async () => {
    const file = await workbook([
      [100, 'P', '1', 'T', 'Normal -NO', new Date(Date.UTC(2026, 8, 28)), 7.5, 'a'],
      [100, 'P', '1', 'T', 'Normal -NO', '29.09.2026', '2,5', ''],
    ]);
    const result = await parseTimecardXlsx(file, WEEK);
    expect(result.errors).toEqual([]);
    expect(result.weeks[0]!.lines[0]!.entries.map((e) => [e.date, e.hours])).toEqual([
      ['2026-09-28', 7.5],
      ['2026-09-29', 2.5],
    ]);
  });

  it('reports invalid rows and merges duplicates', async () => {
    const file = await workbook([
      ['1', 'P', '1', 'T', 'N', '2026-09-28', 'x'],
      ['1', 'P', '1', 'T', 'N', 'i går', 2],
      ['1', 'P', '1', 'T', 'N', '', 2],
      ['1', 'P', '1', 'T', 'N', '2026-09-29', 1, 'a'],
      ['1', 'P', '1', 'T', 'N', '2026-09-29', 2, 'b'],
    ]);
    const result = await parseTimecardXlsx(file, WEEK);
    expect(result.errors.map((e) => e.row)).toEqual([2, 3, 4]);
    expect(result.warnings).toHaveLength(1);
    expect(result.weeks[0]!.lines[0]!.entries).toEqual([
      { date: '2026-09-29', hours: 3, comment: 'a\nb', timeFrom: '', timeTo: '' },
    ]);
  });

  it('splits multiple weeks and puts undated lines in the fallback week', async () => {
    const file = await workbook([
      ['1', 'P', '1', 'T', 'N', '2026-09-28', 1],
      ['1', 'P', '1', 'T', 'N', '2026-10-05', 1],
      ['2', 'Q', '1', 'T', 'N'],
    ]);
    const result = await parseTimecardXlsx(file, '2026-10-12');
    expect(result.weeks.map((w) => [w.weekStart, w.lines.length])).toEqual([
      ['2026-09-28', 1],
      ['2026-10-05', 1],
      ['2026-10-12', 1],
    ]);
  });

  it('rejects files that are not spreadsheets', async () => {
    const result = await parseTimecardXlsx(Buffer.from('hello'), WEEK);
    expect(result.errors[0]!.message).toMatch(/xlsx/);
  });
});
