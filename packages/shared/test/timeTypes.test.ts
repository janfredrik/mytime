import { describe, expect, it } from 'vitest';
import { defaultTimeTypeFor, findTimeType, timeTypeForLine, timeTypesFor } from '../src/timeTypes.js';

describe('standard time types', () => {
  it('offers overtime and marks the 100% types as needing a from/to time', () => {
    expect(findTimeType('Overtime 100% Paid/2 Inv.-NO')).toMatchObject({ group: 'Overtid', timeRange: true });
    expect(findTimeType('Overtime 50% Paid/1.5 Inv.-NO')?.timeRange).toBeUndefined();
    expect(findTimeType('Overtime Part time 100% -NO')?.timeRange).toBe(true);
    expect(findTimeType('Resting after On-Call - NO')?.group).toBe('Reise og hvile');
  });
});

describe('project time types', () => {
  it('offers only the On Call types for OnCall247, whatever the task', () => {
    expect(timeTypesFor(' 245784 ', 'Konsulent').map((t) => t.name)).toEqual([
      'On Call/day -NO',
      'On Call night/weekend -NO',
      'On Call/holiday -NO',
    ]);
    expect(defaultTimeTypeFor('245784')).toBe('On Call/day -NO');
    expect(defaultTimeTypeFor('266411')).toBe('Normal -NO');
  });

  it('offers the absence types per task, with no default when there is a choice', () => {
    expect(timeTypesFor('266411', '3').map((t) => t.name)).toContain('Sick by Doctor -NO');
    expect(timeTypesFor('266411', '5')).toHaveLength(10);
    expect(timeTypesFor('266411', '8')).toHaveLength(2);
    expect(timeTypesFor('266411', '1')).toContainEqual(expect.objectContaining({ name: 'Normal -NO' }));
    expect(defaultTimeTypeFor('266411', '3')).toBe('');
    expect(defaultTimeTypeFor('266411', '7')).toBe('NAV Care/training allowance-NO');
    // The old MyTime has two spaces in some names; they must match exactly.
    expect(findTimeType('Children sick leave  -NO')?.group).toBe('Annet fravær');
  });

  it('swaps known types the project or task does not offer and keeps free text', () => {
    expect(timeTypeForLine('Normal -NO', '245784')).toBe('On Call/day -NO');
    expect(timeTypeForLine('On Call/holiday -NO', '245784')).toBe('On Call/holiday -NO');
    expect(timeTypeForLine('On Call/holiday -NO', '266411')).toBe('Normal -NO');
    expect(timeTypeForLine('', '245784')).toBe('On Call/day -NO');
    expect(timeTypeForLine('Normal -NO', '266411', '3')).toBe('');
    expect(timeTypeForLine('Sick by Doctor -NO', '266411', '7')).toBe('NAV Care/training allowance-NO');
    expect(timeTypeForLine('Egen type', '245784')).toBe('Egen type');
  });
});
