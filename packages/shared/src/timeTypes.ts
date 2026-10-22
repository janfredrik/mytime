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
    group: 'Overtid',
    name: 'Overtime 50% Paid/Stand.-NO',
    description: 'Weekday before 21:00. 50% paid to employee, invoiced to customer at standard price',
  },
  {
    group: 'Overtid',
    name: 'Overtime 50% Paid/1.5 Inv.-NO',
    description: 'Weekday before 21:00. 50% paid to employee, invoiced to customer at 1.5 price',
  },
  {
    group: 'Overtid',
    name: 'Overtime 50% Balance/Stand.-NO',
    description: 'Weekday before 21:00. 50% to overtime balance, invoiced to customer at standard price',
  },
  {
    group: 'Overtid',
    name: 'Overtime 50%Balance/1.5 Inv-NO',
    description: 'Weekday before 21:00. 50% to overtime balance, invoiced to customer at 1.5 price',
  },
  {
    group: 'Overtid',
    name: 'Overtime 100% Paid/Stand.-NO',
    description: 'Weekday after 21:00/weekend. 100% paid to employee, invoiced to customer at standard price',
    timeRange: true,
  },
  {
    group: 'Overtid',
    name: 'Overtime 100% Paid/2 Inv.-NO',
    description: 'Weekday after 21:00/weekend. 100% paid to employee, invoiced to customer at double price',
    timeRange: true,
  },
  {
    group: 'Overtid',
    name: 'Overtime 100%Balance/Stand.-NO',
    description: 'Weekday after 21:00/weekend. 100% to overtime balance, invoiced to customer at standard price',
    timeRange: true,
  },
  {
    group: 'Overtid',
    name: 'Overtime 100%Balance/2 Inv.-NO',
    description: 'Weekday after 21:00/weekend. 100% to overtime balance, invoiced to customer at double price',
    timeRange: true,
  },
  {
    group: 'Overtid',
    name: 'Overtime Christmas/NY WTG2-NO',
    description: 'WTG 2: Overtime on Christmas Eve and New Year’s Eve with 100% compensation, no price rule for invoicing',
  },
  { group: 'Overtid', name: 'Overtime unpaid -NO', description: 'Overtime unpaid' },
  {
    group: 'Overtid lærling og deltid',
    name: 'Overtime Apprentice 50% -NO',
    description: 'Overtime by apprentice with 50% compensation, no price rule for invoicing',
  },
  {
    group: 'Overtid lærling og deltid',
    name: 'Overtime Apprentice 100% -NO',
    description: 'Overtime by apprentice with 100% compensation, no price rule for invoicing',
    timeRange: true,
  },
  {
    group: 'Overtid lærling og deltid',
    name: 'Overtime Part time 50% -NO',
    description: 'Overtime by part-time employee with 50% compensation, no price rule for invoicing',
  },
  {
    group: 'Overtid lærling og deltid',
    name: 'Overtime Part time 100% -NO',
    description: 'Overtime by part-time employee with 100% compensation, no price rule for invoicing',
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
  { group: 'Reise og hvile', name: 'Travel time -NO', description: 'Travel time to balance according to special agreement' },
  // One space on each side of the dash, as in the old MyTime.
  { group: 'Reise og hvile', name: 'Resting after On-Call - NO', description: 'Resting after on-call' },
];

/** Types a project, or one task in it, uses instead of the standard ones. */
interface TimeTypeRule {
  projectNumber: string;
  /** Leave out to cover the whole project. A task rule wins over the project rule. */
  taskNumber?: string;
  types: readonly TimeType[];
  /** Chosen when a line moves here. Without one the user has to pick a type. */
  defaultType?: string;
}

const absence = (group: string, name: string, description: string): TimeType => ({ group, name, description });

export const TIME_TYPE_RULES: readonly TimeTypeRule[] = [
  {
    // OnCall247 - CAT
    projectNumber: '245784',
    types: [
      { group: 'Vakt', name: 'On Call/day -NO', description: 'Vakt på dagtid' },
      { group: 'Vakt', name: 'On Call night/weekend -NO', description: 'Vakt kveld, natt og helg' },
      { group: 'Vakt', name: 'On Call/holiday -NO', description: 'Vakt på helligdag' },
    ],
    defaultType: 'On Call/day -NO',
  },
  {
    // OU424 ABSENCE - Illness
    projectNumber: '266411',
    taskNumber: '3',
    types: [
      absence('Sykdom', 'Sick by Doctor -NO', 'Sykemelding'),
      absence('Sykdom', 'Sick leave by hours -NO', 'Hourly sick leave'),
      absence('Sykdom', 'Sick leave no doc/full day -NO', 'Self-reported sick leave (whole day)'),
    ],
  },
  {
    // OU424 ABSENCE - Other absence. Some names have two spaces before -NO in the old MyTime.
    projectNumber: '266411',
    taskNumber: '5',
    types: [
      absence('Annet fravær', 'Children sick leave  -NO', 'Barns sykdom'),
      absence(
        'Annet fravær',
        'Half day off special days -NO',
        '4hrs Wednesday before Maundy Thursday/Christmas Eve/New Year’s Eve',
      ),
      absence('Annet fravær', 'Leave of Abs. hourly/unpaid-NO', 'Absence hours without pay'),
      absence('Annet fravær', 'Military service paid  -NO', 'Military service with pay'),
      absence('Annet fravær', 'Military service unpaid -NO', 'Military service without pay'),
      absence('Annet fravær', 'Parental leave (10 days)-NO', 'Parental leave Birth/Adoption (10 days)'),
      absence('Annet fravær', 'Parental leave <30 days -NO', 'Parental leave'),
      absence('Annet fravær', 'Resting time -NO', 'Daily/weekly resting time'),
      absence('Annet fravær', 'Shift / week off -NO', 'Friuke skift/vakt'),
      absence('Annet fravær', 'Welfare leave paid -NO', 'Paid welfare leave'),
    ],
  },
  {
    // OU424 ABSENCE - NAV Absence
    projectNumber: '266411',
    taskNumber: '7',
    types: [absence('NAV-fravær', 'NAV Care/training allowance-NO', 'Pleiepenger/opplæringspenger (refusjon)')],
    defaultType: 'NAV Care/training allowance-NO',
  },
  {
    // OU424 ABSENCE - Hourly Empl. Illness
    projectNumber: '266411',
    taskNumber: '8',
    types: [
      absence('Sykdom timelønnede', 'Hourly empl/Sick doctor-NO', 'Sick leave by doctor hourly paid employees'),
      absence('Sykdom timelønnede', 'Hourly empl/Sick no doc-NO', 'Self-reported sick leave hourly paid employees'),
    ],
  },
];

const ALL_TIME_TYPES: readonly TimeType[] = [...STANDARD_TIME_TYPES, ...TIME_TYPE_RULES.flatMap((r) => r.types)];

function ruleFor(projectNumber: string, taskNumber: string): TimeTypeRule | undefined {
  const project = projectNumber.trim();
  const task = taskNumber.trim();
  return (
    TIME_TYPE_RULES.find((r) => r.projectNumber === project && r.taskNumber === task) ??
    TIME_TYPE_RULES.find((r) => r.projectNumber === project && r.taskNumber === undefined)
  );
}

/** The types offered for a project and task. */
export function timeTypesFor(projectNumber: string, taskNumber = ''): readonly TimeType[] {
  return ruleFor(projectNumber, taskNumber)?.types ?? STANDARD_TIME_TYPES;
}

/** The type a line gets by default; empty when the user has to pick one. */
export function defaultTimeTypeFor(projectNumber: string, taskNumber = ''): string {
  const rule = ruleFor(projectNumber, taskNumber);
  return rule ? (rule.defaultType ?? '') : 'Normal -NO';
}

/**
 * The type to keep when a line moves to another project or task: a known type that is not offered
 * there, or none, becomes the default. Free text is kept.
 */
export function timeTypeForLine(type: string, projectNumber: string, taskNumber = ''): string {
  const name = type.trim();
  const offered = timeTypesFor(projectNumber, taskNumber);
  if (name === '' || (findTimeType(name) && !offered.some((t) => t.name === name))) {
    return defaultTimeTypeFor(projectNumber, taskNumber);
  }
  return type;
}

export function findTimeType(name: string): TimeType | undefined {
  return ALL_TIME_TYPES.find((t) => t.name === name.trim());
}
