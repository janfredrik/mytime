import {
  type CatalogProject,
  type CatalogTask,
  type CatalogUpload,
  type CatalogUploadResult,
  splitTaskTitle,
} from '@mytime/shared';
import { asc, eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { catalogProjects, catalogTasks } from '../db/schema.js';

/** Rows per insert; keeps each statement well below Postgres' parameter limit. */
const BATCH = 1000;

export async function listProjects(db: Db): Promise<CatalogProject[]> {
  return db
    .select({ id: catalogProjects.id, number: catalogProjects.number, name: catalogProjects.name })
    .from(catalogProjects)
    .orderBy(asc(catalogProjects.number));
}

export async function listTasks(db: Db, projectId: number): Promise<CatalogTask[]> {
  const rows = await db
    .select({
      id: catalogTasks.id,
      number: catalogTasks.number,
      name: catalogTasks.name,
      description: catalogTasks.description,
    })
    .from(catalogTasks)
    .where(eq(catalogTasks.projectId, projectId));
  // "1.10" after "1.9" and "02" after "1": compare the way people read task numbers.
  return rows.sort((a, b) => a.number.localeCompare(b.number, 'nb', { numeric: true }));
}

/** Replace the whole catalog with the uploaded export. */
export async function replaceCatalog(db: Db, upload: CatalogUpload): Promise<CatalogUploadResult> {
  const projects = new Map<number, typeof catalogProjects.$inferInsert>();
  const tasks = new Map<string, typeof catalogTasks.$inferInsert>();
  for (const p of upload) {
    projects.set(p.project_id, { id: p.project_id, number: p.project_number, name: p.project_name });
    for (const t of p.tasks) {
      const { number, name } = splitTaskTitle(t.task_title);
      tasks.set(`${p.project_id}:${t.task_id}`, {
        projectId: p.project_id,
        id: t.task_id,
        number,
        name,
        description: t.task_description ?? '',
      });
    }
  }

  await db.transaction(async (tx) => {
    await tx.execute(sql`truncate ${catalogTasks}, ${catalogProjects}`);
    const projectRows = [...projects.values()];
    for (let i = 0; i < projectRows.length; i += BATCH) {
      await tx.insert(catalogProjects).values(projectRows.slice(i, i + BATCH));
    }
    const taskRows = [...tasks.values()];
    for (let i = 0; i < taskRows.length; i += BATCH) {
      await tx.insert(catalogTasks).values(taskRows.slice(i, i + BATCH));
    }
  });
  return { projects: projects.size, tasks: tasks.size };
}
