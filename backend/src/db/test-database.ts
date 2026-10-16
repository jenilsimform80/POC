/**
 * The automated tests and the e2e suite never touch the development database. They use a sibling
 * database whose name is the development name plus `_test` (timesheets_dev -> timesheets_dev_test),
 * so `.env` needs only one DATABASE_URL.
 */
export function deriveTestDatabaseUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  const name = url.pathname.slice(1);
  if (!name) throw new Error('DATABASE_URL has no database name');
  if (!name.endsWith('_test')) url.pathname = `/${name}_test`;
  return url.toString();
}
