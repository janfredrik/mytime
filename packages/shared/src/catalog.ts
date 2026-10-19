import { z } from 'zod';

/** Project from the shared time code catalog. `id` is the project's id in the existing system. */
export interface CatalogProject {
  id: number;
  number: string;
  name: string;
}

export interface CatalogTask {
  id: number;
  number: string;
  name: string;
  description: string;
}

/**
 * The file an admin uploads: the JSON produced by the export script run against the existing
 * system (one entry per project, with its tasks).
 */
export const catalogUploadSchema = z
  .array(
    z.object({
      project_id: z.number().int().positive(),
      project_number: z.string().trim().min(1).max(100),
      project_name: z.string().trim().max(300).default(''),
      tasks: z
        .array(
          z.object({
            task_id: z.number().int().positive(),
            task_title: z.string().trim().min(1).max(400),
            task_description: z.string().trim().max(1000).nullish(),
          }),
        )
        .default([]),
    }),
  )
  .min(1, 'Katalogen er tom');
export type CatalogUpload = z.infer<typeof catalogUploadSchema>;

export interface CatalogUploadResult {
  projects: number;
  tasks: number;
}

/** "1.1.1 - Maintenance Work" → number "1.1.1", name "Maintenance Work". */
export function splitTaskTitle(title: string): { number: string; name: string } {
  const at = title.indexOf(' - ');
  if (at === -1) return { number: title.trim(), name: '' };
  return { number: title.slice(0, at).trim(), name: title.slice(at + 3).trim() };
}
