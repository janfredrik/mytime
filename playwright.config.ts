import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3100);
const DATABASE_URL = process.env.E2E_DATABASE_URL ?? process.env.TEST_DATABASE_URL;

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'nb-NO',
    timezoneId: 'Europe/Oslo',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } }],
  webServer: {
    command: 'node apps/server/dist/index.js',
    url: `http://localhost:${PORT}/healthz`,
    reuseExistingServer: false,
    env: {
      NODE_ENV: 'test',
      PORT: String(PORT),
      DATABASE_URL: DATABASE_URL ?? '',
      DEV_AUTH_BYPASS: 'true',
      SESSION_SECRET: 'e2e-secret-e2e-secret-e2e-secret-123',
      LOG_LEVEL: 'warn',
    },
  },
});
