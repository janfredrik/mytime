/** Column layout of the timecard spreadsheet (same as the existing system's export). */
export const COLUMNS = [
  { key: 'projectNumber', header: 'Project number', width: '33.15' },
  { key: 'projectName', header: 'Project name', width: '39.6' },
  { key: 'taskNumber', header: 'Task number', width: '32.4' },
  { key: 'taskName', header: 'Task name', width: '27.599999999999998' },
  { key: 'type', header: 'Type', width: '37.199999999999996' },
  { key: 'date', header: 'Date', width: '15.6' },
  { key: 'hours', header: 'Hours', width: '15.6' },
  { key: 'comment', header: 'Comment', width: '85.2' },
  { key: 'timeFrom', header: 'Time from', width: '23.4' },
  { key: 'timeTo', header: 'Time to', width: '19.5' },
] as const;

export type ColumnKey = (typeof COLUMNS)[number]['key'];

export const SHEET_NAME = 'Timecard';
