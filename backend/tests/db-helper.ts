import { createPrismaClient } from '../src/db/prisma.js';
import { deriveTestDatabaseUrl } from '../src/db/test-database.js';

/**
 * Prisma client for integration tests. Connects to the test database derived from DATABASE_URL
 * (`<name>_test`), never to the development database, because tests delete all rows between cases.
 */
export function createTestPrisma() {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    throw new Error('DATABASE_URL is not set. See backend/README.md (Database setup).');
  }
  return createPrismaClient(deriveTestDatabaseUrl(url));
}
