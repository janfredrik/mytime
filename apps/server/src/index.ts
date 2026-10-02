import { buildApp } from './app.js';
import { purgeExpiredSessions } from './auth/sessions.js';
import { loadConfig } from './config.js';
import { createDb, runMigrations } from './db/client.js';

const config = loadConfig();
const { db, close } = createDb(config.DATABASE_URL);
await runMigrations(db);

const app = await buildApp({ config, db });
if (config.DEV_AUTH_BYPASS) app.log.warn('DEV_AUTH_BYPASS er aktivert – kun for utvikling!');

const purge = setInterval(
  () => purgeExpiredSessions(db).catch((err) => app.log.error({ err }, 'Session purge failed')),
  60 * 60 * 1000,
);

const shutdown = async (signal: string) => {
  app.log.info(`${signal} mottatt, avslutter`);
  clearInterval(purge);
  await app.close();
  await close();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ port: config.PORT, host: config.HOST });
