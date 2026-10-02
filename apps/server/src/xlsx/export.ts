import { type Line, formatHoursExport, isoWeekOf } from '@mytime/shared';
import { strToU8, zipSync } from 'fflate';
import { COLUMNS, SHEET_NAME } from './columns.js';

/**
 * Writes the timecard spreadsheet in the same layout as the existing system's export
 * (one sheet "Timecard", columns A–J, every value as an inline string).
 */

type Cell = string | null; // null = empty cell without value

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8"?>';

function escapeXml(value: string): string {
  return value
    // Strip characters that are not allowed in XML 1.0.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const colLetter = (index: number) => String.fromCharCode(65 + index);

function cellXml(ref: string, value: Cell, style: number): string {
  if (value === null) return `<c r="${ref}" s="${style}" />`;
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
}

function rowXml(rowNumber: number, cells: Cell[], style: number): string {
  const inner = cells.map((v, i) => cellXml(`${colLetter(i)}${rowNumber}`, v, style)).join('');
  return `<row r="${rowNumber}" >${inner}</row>`;
}

export function timecardRows(lines: readonly Line[]): Cell[][] {
  const rows: Cell[][] = [];
  for (const line of lines) {
    const base: Cell[] = [
      line.projectNumber,
      line.projectName,
      line.taskNumber,
      line.taskName,
      line.type,
    ];
    if (line.entries.length === 0) {
      rows.push(base);
      continue;
    }
    for (const e of line.entries) {
      rows.push([
        ...base,
        e.date,
        formatHoursExport(e.hours),
        e.comment === '' ? null : e.comment,
        e.timeFrom,
        e.timeTo,
      ]);
    }
  }
  return rows;
}

function sheetXml(lines: readonly Line[]): string {
  const rows = timecardRows(lines);
  const lastRow = rows.at(-1);
  const dimension = lastRow
    ? `A1:${colLetter(lastRow.length - 1)}${rows.length + 1}`
    : `A1:${colLetter(COLUMNS.length - 1)}1`;
  const cols = COLUMNS.map(
    (c, i) =>
      `<col width="${c.width}" min="${i + 1}" max="${i + 1}" bestFit="1" customWidth="1" />`,
  ).join('');
  const body = [
    rowXml(
      1,
      COLUMNS.map((c) => c.header),
      3,
    ),
    ...rows.map((cells, i) => rowXml(i + 2, cells, 0)),
  ].join('');

  return (
    XML_HEADER +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xml:space="preserve">' +
    '<sheetPr ><pageSetUpPr fitToPage="0" /></sheetPr>' +
    `<dimension ref="${dimension}"></dimension>` +
    '<sheetViews><sheetView defaultGridColor="1" rightToLeft="0" showFormulas="0" showGridLines="1" showRowColHeaders="1" showRuler="1" showWhiteSpace="0" showZeros="1" tabSelected="0" windowProtection="0" showOutlineSymbols="1" zoomScaleSheetLayoutView="0" zoomScalePageLayoutView="0" zoomScaleNormal="0" workbookViewId="0" zoomScale="100" ></sheetView></sheetViews>' +
    '<sheetFormatPr baseColWidth="8" defaultRowHeight="18" />' +
    `<cols>${cols}</cols>` +
    `<sheetData>${body}</sheetData>` +
    '<sheetCalcPr fullCalcOnLoad="1" /><printOptions gridLines="0" headings="0" horizontalCentered="0" verticalCentered="0" /><pageMargins left="0.75" right="0.75" top="1.0" bottom="1.0" header="0.5" footer="0.5" /><pageSetup /><headerFooter ></headerFooter></worksheet>'
  );
}

const CONTENT_TYPES =
  XML_HEADER +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default ContentType="application/vnd.openxmlformats-package.relationships+xml" Extension="rels"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>';

const ROOT_RELS =
  XML_HEADER +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="xl/workbook.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Id="rId3"/><Relationship Target="docProps/core.xml" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Id="rId4"/><Relationship Target="docProps/app.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Id="rId5"/></Relationships>';

const APP =
  XML_HEADER +
  '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"></Properties>';

const core = (created: Date) =>
  XML_HEADER +
  `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>MyTime</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${created.toISOString().replace(/\.\d{3}Z$/, 'Z')}</dcterms:created><cp:revision>0</cp:revision></cp:coreProperties>`;

const WORKBOOK =
  XML_HEADER +
  `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr date1904="false"/><sheets><sheet sheetId="1" name="${SHEET_NAME}" r:id="rId1"></sheet></sheets></workbook>`;

const WORKBOOK_RELS =
  XML_HEADER +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="worksheets/sheet1.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Id="rId1"/><Relationship Target="styles.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Id="rId2"/></Relationships>';

const SHEET_RELS =
  XML_HEADER +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';

const STYLES =
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt formatCode="yyyy/mm/dd" numFmtId="100" /><numFmt formatCode="yyyy/mm/dd hh:mm:ss" numFmtId="101" /></numFmts><fonts count="2"><font><name val="Calibri"/><sz val="12"/><family val="1"/></font><font><sz val="13"/><b val="1"/><i val="1"/><name val="Calibri"/><family val="1"/><color rgb="FFFFFFFF" /></font></fonts><fills count="3"><fill><patternFill patternType="none"></patternFill></fill><fill><patternFill patternType="gray125"></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF000000" /><bgColor rgb="FF000000" /></patternFill></fill></fills><borders count="2"><border ></border><border ><left style="thin"><color rgb="FF000000" /></left><right style="thin"><color rgb="FF000000" /></right><top style="thin"><color rgb="FF000000" /></top><bottom style="thin"><color rgb="FF000000" /></bottom></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" ></xf></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" ></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" ></xf><xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" ></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" applyNumberFormat="0" applyFont="1" applyFill="1" applyBorder="0" applyAlignment="0" applyProtection="0" ></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" /></cellStyles><dxfs count="0"></dxfs><tableStyles defaultTableStyle="TableStyleMedium9" defaultPivotStyle="PivotStyleLight16" count="0" ></tableStyles></styleSheet>';

export function buildTimecardXlsx(lines: readonly Line[], now: Date = new Date()): Uint8Array {
  return zipSync(
    {
      '[Content_Types].xml': strToU8(CONTENT_TYPES),
      '_rels/.rels': strToU8(ROOT_RELS),
      'docProps/app.xml': strToU8(APP),
      'docProps/core.xml': strToU8(core(now)),
      'xl/workbook.xml': strToU8(WORKBOOK),
      'xl/_rels/workbook.xml.rels': strToU8(WORKBOOK_RELS),
      'xl/styles.xml': strToU8(STYLES),
      'xl/worksheets/sheet1.xml': strToU8(sheetXml(lines)),
      'xl/worksheets/_rels/sheet1.xml.rels': strToU8(SHEET_RELS),
    },
    { level: 6 },
  );
}

/** File name like the existing system: week40_02102026130256.xlsx (local Oslo time). */
export function exportFileName(weekStart: string, now: Date = new Date()): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Oslo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const stamp = `${parts.day}${parts.month}${parts.year}${parts.hour}${parts.minute}${parts.second}`;
  return `week${isoWeekOf(weekStart).week}_${stamp}.xlsx`;
}
