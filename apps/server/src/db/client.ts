import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as schema from './schema.js';

export type Db = ReturnType<typeof createDb>['db'];

export function createDb(url: string) {
  const sql = postgres(url, { max: 10, onnotice: () => {} });
  const db = drizzle(sql, { schema });
  return { db, close: () => sql.end({ timeout: 5 }) };
}

/** Locate the `drizzle` migrations folder both from `src/db` (dev/test) and `dist` (prod). */
function migrationsFolder(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 4; i++) {
    const candidate = join(dir, 'drizzle');
    if (existsSync(join(candidate, 'meta'))) return candidate;
    dir = dirname(dir);
  }
  throw new Error('Fant ikke migrasjonsmappen (drizzle)');
}

export async function runMigrations(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder: migrationsFolder() });
}
