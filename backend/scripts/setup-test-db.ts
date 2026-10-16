/**
 * Creates the derived test database (see src/db/test-database.ts) if it does not exist and applies
 * the committed migrations to it. Safe to run repeatedly; never touches the development data.
 * Usage: npm run db:setup:test   (also runs automatically before `npm test`)
 */
import { execFileSync } from 'node:child_process';
import { loadEnv } from '../src/config/env.js';
import { createPrismaClient } from '../src/db/prisma.js';
import { deriveTestDatabaseUrl } from '../src/db/test-database.js';

const env = loadEnv();
const testUrl = deriveTestDatabaseUrl(env.DATABASE_URL);
const testName = new URL(testUrl).pathname.slice(1);

// CREATE DATABASE cannot run inside a transaction or take parameters; the name comes from our own
// .env and is restricted to a plain identifier before it is interpolated.
if (!/^[A-Za-z0-9_]+$/.test(testName)) {
  throw new Error(
    `Unsupported test database name "${testName}" (letters, digits, underscore only).`,
  );
}

const prisma = createPrismaClient(env.DATABASE_URL);
try {
  const rows = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = ${testName}) AS exists`;
  if (!rows[0]?.exists) {
    await prisma.$executeRawUnsafe(`CREATE DATABASE "${testName}"`);
    console.log(`Created database ${testName}.`);
  }
} finally {
  await prisma.$disconnect();
}

execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
  env: { ...process.env, DATABASE_URL: testUrl },
  stdio: 'inherit',
});
