/**
 * Empties EVERY table of a disposable test database (used by the end-to-end suite before it seeds
 * demo users). Refuses to run unless the target database name ends in `_test`.
 * Usage: DATABASE_URL=<test db url> npm run db:reset:test
 */
import { loadEnv } from '../src/config/env.js';
import { createPrismaClient } from '../src/db/prisma.js';

const env = loadEnv();
const dbName = new URL(env.DATABASE_URL).pathname.slice(1);
if (!dbName.endsWith('_test')) {
  throw new Error(`Refusing to reset "${dbName}": only databases whose name ends with _test.`);
}

const prisma = createPrismaClient(env.DATABASE_URL);
try {
  // TRUNCATE does not fire the row-level append-only / period-lock triggers, which is what a
  // full reset of disposable data needs.
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE audit_logs, approvals, weekly_submissions, locked_periods, sessions, time_entries, tasks, projects, users CASCADE',
  );
  console.log(`Reset all tables in ${dbName}.`);
} finally {
  await prisma.$disconnect();
}
