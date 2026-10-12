import { createPrismaClient } from '../src/db/prisma.js';

/**
 * Prisma client for integration tests. Refuses to run unless the target is clearly a
 * separate test database, because tests delete all rows between cases.
 */
export function createTestPrisma() {
  const url = process.env['TEST_DATABASE_URL'];
  if (!url) {
    throw new Error('TEST_DATABASE_URL is not set. See backend/README.md (Database setup).');
  }
  if (url === process.env['DATABASE_URL']) {
    throw new Error('TEST_DATABASE_URL must not equal DATABASE_URL.');
  }
  const dbName = new URL(url).pathname.slice(1);
  if (!dbName.endsWith('_test')) {
    throw new Error(
      `Refusing to run tests against "${dbName}": database name must end with _test.`,
    );
  }
  return createPrismaClient(url);
}
