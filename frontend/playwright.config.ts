import { defineConfig } from '@playwright/test';
import { testDatabaseUrl } from './e2e/support/env';

const databaseUrl = testDatabaseUrl();
// E2E_EXTERNAL_SERVERS=1: test an already running stack (e.g. a production-like one) instead of
// starting the dev servers; set E2E_BASE_URL to its address. global-setup still resets/seeds the DB.
const external = process.env['E2E_EXTERNAL_SERVERS'] === '1';

/**
 * End-to-end tests: a REAL browser (system Google Chrome) against the REAL frontend (Vite) and the
 * REAL backend, on the configured database, which global-setup empties and seeds each run.
 * Run: `npm run e2e` (needs Google Chrome; or run `npx playwright install chromium` and change
 * `channel` to remove it).
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1, // specs share one database
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    // 127.0.0.1, not localhost: Playwright's API request client adds a fixed ~5 s delay to EVERY request
    // to `localhost` (measured: 5.1 s vs 4 ms), which made the suite crawl. The e2e backend therefore
    // allows both origins (FRONTEND_URL below); real users should still open http://localhost:5173.
    baseURL: process.env['E2E_BASE_URL'] ?? 'http://127.0.0.1:5173',
    channel: 'chrome',
    screenshot: 'only-on-failure',
    trace: 'off',
  },
  webServer: external
    ? undefined
    : [
        {
          command: 'node --env-file=.env --import tsx src/server.ts',
          cwd: '../backend',
          url: 'http://localhost:3000/api/health',
          reuseExistingServer: false,
          timeout: 60_000,
          env: {
            DATABASE_URL: databaseUrl,
            NODE_ENV: 'development', // plain-HTTP localhost: the Secure/__Host- cookie is for production
            PORT: '3000',
            FRONTEND_URL: 'http://localhost:5173,http://127.0.0.1:5173',
            LOGIN_RATE_LIMIT_MAX: '200', // the suite signs in many times from one IP
            LOGIN_ATTEMPT_LIMIT_MAX: '2000',
          },
        },
        {
          command: 'npx vite',
          env: { VITE_API_URL: 'http://127.0.0.1:3000/api' }, // same site as the 127.0.0.1 page: the cookie is kept
          url: 'http://127.0.0.1:5173',
          reuseExistingServer: false,
          timeout: 60_000,
        },
      ],
});
