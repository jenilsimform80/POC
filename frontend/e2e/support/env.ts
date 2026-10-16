import { readFileSync } from 'node:fs';
import path from 'node:path';

export const backendDir = path.resolve(process.cwd(), '../backend');

/**
 * The database the end-to-end suite resets and fills. Never the development database: it is the
 * DATABASE_URL from backend/.env with `_test` appended to the database name (the same rule as
 * backend/src/db/test-database.ts), or E2E_DATABASE_URL. It must end in `_test`: the suite wipes it.
 */
export function testDatabaseUrl(): string {
  let url = process.env['E2E_DATABASE_URL'];
  if (!url) {
    const text = readFileSync(path.join(backendDir, '.env'), 'utf8');
    const dev = /^DATABASE_URL=(.+)$/m.exec(text)?.[1]?.trim();
    if (!dev) throw new Error('Set E2E_DATABASE_URL or DATABASE_URL in backend/.env');
    const derived = new URL(dev);
    if (!derived.pathname.slice(1).endsWith('_test')) derived.pathname += '_test';
    url = derived.toString();
  }
  const dbName = new URL(url).pathname.slice(1);
  if (!dbName.endsWith('_test')) {
    throw new Error(
      `Refusing to run e2e against "${dbName}": it would wipe the database. Use a *_test database.`,
    );
  }
  return url;
}
