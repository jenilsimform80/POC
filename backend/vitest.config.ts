import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    env: { NODE_ENV: 'test' },
    setupFiles: ['tests/setup-env.ts'],
    // DB integration tests share one database, so run test files one at a time.
    fileParallelism: false,
  },
});
