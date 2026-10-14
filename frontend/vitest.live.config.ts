import { defineConfig } from 'vitest/config';

// Opt-in contract check against a REAL running backend (see tests-live/README in frontend/README.md).
// Not part of `npm test`: it needs the API + a disposable database.
export default defineConfig({
  define: {
    'import.meta.env.VITE_API_URL': JSON.stringify(
      process.env['LIVE_API_BASE'] ?? 'http://localhost:3000/api',
    ),
  },
  test: {
    environment: 'node',
    include: ['tests-live/**/*.live.ts'],
    testTimeout: 30_000,
    fileParallelism: false,
  },
});
