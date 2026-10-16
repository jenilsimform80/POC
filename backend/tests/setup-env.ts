// Vitest does not read .env; load it so integration tests can derive their test database from DATABASE_URL.
try {
  process.loadEnvFile('.env');
} catch {
  // no .env file - rely on the process environment
}
