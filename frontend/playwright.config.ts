import { defineConfig } from '@playwright/test';
import { testDatabaseUrl } from './e2e/support/env';

const databaseUrl = testDatabaseUrl();
// Ports are overridable so the suite can run while a dev stack occupies 3000/5173.
const backendPort = process.env['E2E_BACKEND_PORT'] ?? '3000';
const frontendPort = process.env['E2E_FRONTEND_PORT'] ?? '5173';
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
    baseURL: process.env['E2E_BASE_URL'] ?? `http://127.0.0.1:${frontendPort}`,
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
          url: `http://localhost:${backendPort}/api/health`,
          reuseExistingServer: false,
          timeout: 60_000,
          env: {
            DATABASE_URL: databaseUrl,
            NODE_ENV: 'development', // plain-HTTP localhost; JWT_SECRET comes from backend/.env
            PORT: backendPort,
            FRONTEND_URL: `http://localhost:${frontendPort},http://127.0.0.1:${frontendPort}`,
            LOGIN_RATE_LIMIT_MAX: '200', // the suite signs in many times from one IP
            LOGIN_ATTEMPT_LIMIT_MAX: '2000',
          },
        },
        {
          command: `npx vite --port ${frontendPort} --strictPort`,
          env: { VITE_API_URL: `http://127.0.0.1:${backendPort}/api` }, // cross-origin to the backend: CORS allows both origins above
          url: `http://127.0.0.1:${frontendPort}`,
          reuseExistingServer: false,
          timeout: 60_000,
        },
      ],
});
