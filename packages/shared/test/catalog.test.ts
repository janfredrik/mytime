import { describe, expect, it } from 'vitest';
import { catalogUploadSchema, splitTaskTitle } from '../src/index.js';

describe('catalog', () => {
  it('splits task titles into number and name at the first separator', () => {
    expect(splitTaskTitle('1.1.1 - Maintenance Work')).toEqual({ number: '1.1.1', name: 'Maintenance Work' });
    expect(splitTaskTitle('DM - Delivery management')).toEqual({ number: 'DM', name: 'Delivery management' });
    expect(splitTaskTitle('EAI.DEP - EAI - Deployments')).toEqual({ number: 'EAI.DEP', name: 'EAI - Deployments' });
    expect(splitTaskTitle('17')).toEqual({ number: '17', name: '' });
  });

  it('accepts the export file and rejects an empty one', () => {
    const parsed = catalogUploadSchema.parse([
      {
        project_id: 900001,
        project_name: 'Kunde A - Drift',
        project_number: '100001',
        tasks: [{ task_id: 1, task_title: '06.1 - Travel', task_description: null }],
      },
    ]);
    expect(parsed[0]!.tasks[0]!.task_title).toBe('06.1 - Travel');
    expect(catalogUploadSchema.safeParse([]).success).toBe(false);
  });
});
