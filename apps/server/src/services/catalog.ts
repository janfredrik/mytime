import {
  type CatalogProject,
  type CatalogTask,
  type CatalogUpload,
  type CatalogUploadResult,
  type ShareCandidate,
  type ShareCandidateTask,
  type ShareCodes,
  splitTaskTitle,
} from '@mytime/shared';
import { type AnyColumn, eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { catalogProjects, catalogTasks, sharedProjects, sharedTasks, timecardLines, timecards } from '../db/schema.js';

/** Rows per insert; keeps each statement well below Postgres' parameter limit. */
const BATCH = 1000;

/** Catalog projects plus shared projects the catalog lacks. Shared ids are negated to keep them apart. */
export async function listProjects(db: Db): Promise<CatalogProject[]> {
  const [catalog, shared] = await Promise.all([
    db
      .select({ id: catalogProjects.id, number: catalogProjects.number, name: catalogProjects.name })
      .from(catalogProjects),
    db.select().from(sharedProjects),
  ]);
  const known = new Set(catalog.map((p) => p.number));
  const extra = shared
    .filter((p) => !known.has(p.number))
    .map((p) => ({ id: -p.id, number: p.number, name: p.name, shared: true }));
  return [...catalog, ...extra].sort((a, b) => a.number.localeCompare(b.number, 'nb', { numeric: true }));
}

/** Tasks of a catalog project (with shared tasks the catalog lacks), or of a shared project (negative id). */
export async function listTasks(db: Db, projectId: number): Promise<CatalogTask[]> {
  let rows: CatalogTask[] = [];
  let sharedProjectId: number | undefined = projectId < 0 ? -projectId : undefined;
  if (projectId > 0) {
    rows = await db
      .select({
        id: catalogTasks.id,
        number: catalogTasks.number,
        name: catalogTasks.name,
        description: catalogTasks.description,
      })
      .from(catalogTasks)
      .where(eq(catalogTasks.projectId, projectId));
    const [match] = await db
      .select({ id: sharedProjects.id })
      .from(sharedProjects)
      .innerJoin(catalogProjects, eq(catalogProjects.number, sharedProjects.number))
      .where(eq(catalogProjects.id, projectId));
    sharedProjectId = match?.id;
  }
  if (sharedProjectId !== undefined) {
    const known = new Set(rows.map((t) => t.number));
    const shared = await db
      .select({ id: sharedTasks.id, number: sharedTasks.number, name: sharedTasks.name })
      .from(sharedTasks)
      .where(eq(sharedTasks.projectId, sharedProjectId));
    for (const t of shared) {
      if (!known.has(t.number)) rows.push({ id: -t.id, number: t.number, name: t.name, description: '', shared: true });
    }
  }
  // "1.10" after "1.9" and "02" after "1": compare the way people read task numbers.
  return rows.sort((a, b) => a.number.localeCompare(b.number, 'nb', { numeric: true }));
}

/** Time codes in use on anyone's timecard that nobody can pick yet, for an admin to review. */
export async function shareCandidates(db: Db): Promise<ShareCandidate[]> {
  const projectNumber = sql<string>`trim(${timecardLines.projectNumber})`;
  const taskNumber = sql<string>`trim(${timecardLines.taskNumber})`;
  // The name most people use; blank names only when nobody wrote one.
  const commonName = (column: AnyColumn) =>
    sql<string>`coalesce(mode() within group (order by nullif(trim(${column}), '')), '')`;
  const users = sql<number>`count(distinct ${timecards.userId})::int`;
  const inUse = sql`${projectNumber} <> ''`;

  const [usedProjects, usedTasks, catalogRows, sharedRows] = await Promise.all([
    db
      .select({ number: projectNumber, name: commonName(timecardLines.projectName), users })
      .from(timecardLines)
      .innerJoin(timecards, eq(timecards.id, timecardLines.timecardId))
      .where(inUse)
      .groupBy(projectNumber),
    db
      .select({ project: projectNumber, number: taskNumber, name: commonName(timecardLines.taskName), users })
      .from(timecardLines)
      .innerJoin(timecards, eq(timecards.id, timecardLines.timecardId))
      .where(sql`${inUse} and ${taskNumber} <> ''`)
      .groupBy(projectNumber, taskNumber),
    db
      .select({ project: catalogProjects.number, task: catalogTasks.number })
      .from(catalogProjects)
      .leftJoin(catalogTasks, eq(catalogTasks.projectId, catalogProjects.id)),
    db
      .select({ project: sharedProjects.number, task: sharedTasks.number })
      .from(sharedProjects)
      .leftJoin(sharedTasks, eq(sharedTasks.projectId, sharedProjects.id)),
  ]);
  const known = [...catalogRows, ...sharedRows];
  const knownProjects = new Set(known.map((r) => r.project));
  const knownTasks = new Set(known.filter((r) => r.task !== null).map((r) => `${r.project}\u001f${r.task}`));

  const tasksOf = new Map<string, ShareCandidateTask[]>();
  for (const t of usedTasks) {
    if (knownTasks.has(`${t.project}\u001f${t.number}`)) continue;
    const list = tasksOf.get(t.project) ?? [];
    list.push({ number: t.number, name: t.name, users: t.users });
    tasksOf.set(t.project, list);
  }
  const byNumber = (a: { number: string }, b: { number: string }) =>
    a.number.localeCompare(b.number, 'nb', { numeric: true });
  return usedProjects
    .map((p) => ({
      ...p,
      available: knownProjects.has(p.number),
      tasks: (tasksOf.get(p.number) ?? []).sort(byNumber),
    }))
    .filter((p) => !p.available || p.tasks.length > 0)
    .sort(byNumber);
}

/** Share the codes an admin picked. Codes already shared keep their names. Returns what was added. */
export async function shareCodes(db: Db, input: ShareCodes): Promise<CatalogUploadResult> {
  return db.transaction(async (tx) => {
    const before = await sharedCounts(tx);
    const projects = new Map(input.projects.map((p) => [p.number, p]));
    const projectRows = [...projects.values()].map((p) => ({ number: p.number, name: p.name }));
    for (let i = 0; i < projectRows.length; i += BATCH) {
      await tx
        .insert(sharedProjects)
        .values(projectRows.slice(i, i + BATCH))
        .onConflictDoUpdate({
          target: sharedProjects.number,
          set: { name: sql`case when ${sharedProjects.name} = '' then excluded.name else ${sharedProjects.name} end` },
        });
    }
    const ids = await tx.select({ id: sharedProjects.id, number: sharedProjects.number }).from(sharedProjects);
    const idOf = new Map(ids.map((p) => [p.number, p.id]));
    const taskRows = [...projects.values()].flatMap((p) =>
      p.tasks.map((t) => ({ projectId: idOf.get(p.number)!, number: t.number, name: t.name })),
    );
    for (let i = 0; i < taskRows.length; i += BATCH) {
      await tx.insert(sharedTasks).values(taskRows.slice(i, i + BATCH)).onConflictDoNothing();
    }
    const after = await sharedCounts(tx);
    return { projects: after.projects - before.projects, tasks: after.tasks - before.tasks };
  });
}

/** Shared projects the catalog lacks (the others only hold extra tasks) and all shared tasks. */
async function sharedCounts(db: Pick<Db, 'select'>): Promise<CatalogUploadResult> {
  const [[projects], [tasks]] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(sharedProjects)
      .where(sql`not exists (select 1 from ${catalogProjects} where ${catalogProjects.number} = ${sharedProjects.number})`),
    db.select({ n: sql<number>`count(*)::int` }).from(sharedTasks),
  ]);
  return { projects: projects!.n, tasks: tasks!.n };
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
