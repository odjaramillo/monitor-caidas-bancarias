import { defineConfig, devices } from '@playwright/test';
import { API_URL, WEB_URL } from './e2e/env.js';

// The tests send reports, so they write to the database. A remote database is refused.
// The error never prints the URL, because it can carry the password.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !['localhost', '127.0.0.1'].includes(new URL(databaseUrl).hostname)) {
  throw new Error('The browser tests need DATABASE_URL set to a PostgreSQL on localhost.');
}

// Browser tests of the two screens (issue #111). They run against the static build and the
// compiled API, so run `pnpm build` first. Only Chromium: other browsers are out of scope.
export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.e2e.ts',
  // The tests share one database, so they run one at a time.
  fullyParallel: false,
  workers: 1,
  // A focused test in CI would hide the others. A retry would hide a flaky test.
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure'
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // A server that is already running is never reused: the tests always check this build.
  webServer: [
    {
      command: 'pnpm --filter api migrate up && pnpm --filter api start',
      // /status answers 503 until the first count, so the tests start after it.
      url: `${API_URL}/status`,
      reuseExistingServer: false,
      env: {
        DATABASE_URL: databaseUrl,
        HOST: '127.0.0.1',
        PORT: new URL(API_URL).port || '80',
        CORS_ORIGIN: WEB_URL,
        // A new report reaches the status screen in about one second.
        STATUS_INTERVAL_MS: '1000'
      }
    },
    {
      command: `pnpm preview --port ${new URL(WEB_URL).port} --strictPort`,
      url: WEB_URL,
      reuseExistingServer: false
    }
  ]
});
