import { readFileSync } from 'node:fs';
import path from 'node:path';

export const backendDir = path.resolve(process.cwd(), '../backend');

/**
 * The DISPOSABLE database the end-to-end suite may reset and fill. Taken from E2E_DATABASE_URL, or
 * the backend's TEST_DATABASE_URL. It must be a *_test database: the suite wipes it.
 */
export function testDatabaseUrl(): string {
  let url = process.env['E2E_DATABASE_URL'];
  if (!url) {
    const text = readFileSync(path.join(backendDir, '.env'), 'utf8');
    url = /^TEST_DATABASE_URL=(.+)$/m.exec(text)?.[1]?.trim();
  }
  if (!url) throw new Error('Set E2E_DATABASE_URL or TEST_DATABASE_URL in backend/.env');
  const dbName = new URL(url).pathname.slice(1);
  if (!dbName.endsWith('_test')) {
    throw new Error(
      `Refusing to run e2e against "${dbName}": it would wipe the database. Use a *_test database.`,
    );
  }
  return url;
}
