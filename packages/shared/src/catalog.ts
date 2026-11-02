import { z } from 'zod';
import { TEXT_LIMITS } from './timecard.js';

/**
 * Project from the shared time code catalog. `id` is the project's id in the existing system, or
 * negative for a code someone has used that the catalog lacks, shared by an admin (`shared`).
 */
export interface CatalogProject {
  id: number;
  number: string;
  name: string;
  shared?: boolean;
}

export interface CatalogTask {
  id: number;
  number: string;
  name: string;
  description: string;
  shared?: boolean;
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

/** A time code in use on someone's timecard that nobody can pick yet. `users` counts the people using it. */
export interface ShareCandidateTask {
  number: string;
  name: string;
  users: number;
}

export interface ShareCandidate {
  number: string;
  name: string;
  users: number;
  /** The project can be picked already (catalog or shared); only its tasks are new. */
  available: boolean;
  tasks: ShareCandidateTask[];
}

/** The codes an admin picked to share. A task needs its project, so tasks travel inside it. */
export const shareCodesSchema = z.object({
  projects: z
    .array(
      z.object({
        number: z.string().trim().min(1).max(TEXT_LIMITS.projectNumber),
        name: z.string().trim().max(TEXT_LIMITS.projectName).default(''),
        tasks: z
          .array(
            z.object({
              number: z.string().trim().min(1).max(TEXT_LIMITS.taskNumber),
              name: z.string().trim().max(TEXT_LIMITS.taskName).default(''),
            }),
          )
          .max(10_000)
          .default([]),
      }),
    )
    .min(1, 'Velg minst én timekode')
    .max(20_000),
});
export type ShareCodes = z.infer<typeof shareCodesSchema>;

/** "1.1.1 - Maintenance Work" → number "1.1.1", name "Maintenance Work". */
export function splitTaskTitle(title: string): { number: string; name: string } {
  const at = title.indexOf(' - ');
  if (at === -1) return { number: title.trim(), name: '' };
  return { number: title.slice(0, at).trim(), name: title.slice(at + 3).trim() };
}
