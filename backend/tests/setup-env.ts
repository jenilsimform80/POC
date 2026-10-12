// Vitest does not read .env; load it so integration tests can find TEST_DATABASE_URL.
try {
  process.loadEnvFile('.env');
} catch {
  // no .env file - rely on the process environment
}
