/** A time type (expenditure type in the old MyTime). Lines store the name, so it must match exactly. */
export interface TimeType {
  name: string;
  description: string;
  group: string;
  /** The old MyTime requires a from/to time for this type, which this app does not record. */
  timeRange?: boolean;
}

/** Norwegian types offered in the type field. Users can still type any other type. */
export const STANDARD_TIME_TYPES: readonly TimeType[] = [
  { group: 'Ordinær tid', name: 'Normal -NO', description: 'Normal timer' },
  { group: 'Ordinær tid', name: 'Hourly pay -NO', description: 'Hourly pay (Only employees who are paid hourly)' },
  { group: 'Ordinær tid', name: 'Hourly pay/part time -NO', description: 'Hourly pay (Part-time employees)' },
  { group: 'Ordinær tid', name: 'Hourly pay/shift -NO', description: 'Hourly pay (Shift employees)' },
  {
    group: 'Ulempetillegg',
    name: 'Inconven.all./Evening 17-21-NO',
    description: 'Inconvenience allowance variable - Evening 17-21',
    timeRange: true,
  },
  {
    group: 'Ulempetillegg',
    name: 'Inconven.all./Night 21-07-NO',
    description: 'Inconvenience allowance variable - Night 21-07',
    timeRange: true,
  },
  {
    group: 'Ulempetillegg',
    name: 'Inconven.all./Weekend 07-17-NO',
    description: 'Inconvenience allowance variable - Weekend 07-17',
    timeRange: true,
  },
  {
    group: 'Ulempetillegg',
    name: 'Inconven.all./Weekend 17-21-NO',
    description: 'Inconvenience allowance variable - Weekend 17-21',
    timeRange: true,
  },
  {
    group: 'Ulempetillegg',
    name: 'Inconven.all./Weekend 21-07-NO',
    description: 'Inconvenience allowance variable - Weekend 21-07',
    timeRange: true,
  },
  {
    group: 'Pålagt arbeid i hviletid',
    name: 'Mandat.work/rest period 50%-NO',
    description: 'Mandatory work in rest period 50% (weekday before 21)',
  },
  {
    group: 'Pålagt arbeid i hviletid',
    name: 'Mandat.work/rest period100%-NO',
    description: 'Mandatory work in rest period 100% (weekday after 21 or weekend)',
  },
  {
    group: 'Høytid skift',
    name: 'Festivity. Shift 100/Paid-NO',
    description: 'Høytid Skiftarb Overtid 100%. 1. juledag, 1. påskedag, 1. pinsedag, 1. mai og 17. mai.',
  },
  {
    group: 'Høytid skift',
    name: 'Festivity. Shift100/Balance-NO',
    description: 'Høytid Skift Overtidstill 100%. 1. juledag, 1. påskedag, 1. pinsedag, 1. mai og 17. mai.',
  },
  { group: 'Tillegg og fakturering', name: 'Allowance for call received-NO', description: 'Allowance for each call received' },
  { group: 'Tillegg og fakturering', name: 'Allowance if called to work-NO', description: 'Allowance for being called in to work' },
  {
    group: 'Tillegg og fakturering',
    name: 'Hours only for invoice -NO',
    description: 'Hours only for customer invoice if need to invoice more than worked hours',
  },
];

export function findTimeType(name: string): TimeType | undefined {
  return STANDARD_TIME_TYPES.find((t) => t.name === name.trim());
}
