import { defineConfig } from 'prisma/config';

// Prisma 7 does not load .env itself. Node 22 can; ignore a missing file (e.g. CI sets real env vars).
try {
  process.loadEnvFile('.env');
} catch {
  // no .env file - rely on the process environment
}

// `DB_TARGET=test` points migrate commands at the isolated test database.
const databaseUrl =
  process.env['DB_TARGET'] === 'test'
    ? process.env['TEST_DATABASE_URL']
    : process.env['DATABASE_URL'];

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: databaseUrl ?? '' },
});
