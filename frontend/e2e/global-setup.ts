import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { backendDir, testDatabaseUrl } from './support/env';

/** Empties the disposable database and seeds the demo users with a fresh random password. */
export default function globalSetup(): void {
  const password = `${randomBytes(12).toString('hex')}-Aa1`;
  process.env['E2E_PASSWORD'] = password; // inherited by the test workers started afterwards

  const env = {
    ...process.env,
    DATABASE_URL: testDatabaseUrl(),
    SEED_PASSWORD: password,
    NODE_ENV: 'development',
  };
  // Run with the plain environment (dev DATABASE_URL from backend/.env): it creates the *_test sibling.
  execFileSync('npm', ['run', '-s', 'db:setup:test'], {
    cwd: backendDir,
    env: process.env,
    stdio: 'inherit',
  });
  execFileSync('npm', ['run', '-s', 'db:reset:test'], { cwd: backendDir, env, stdio: 'inherit' });
  execFileSync('npm', ['run', '-s', 'db:seed'], { cwd: backendDir, env, stdio: 'inherit' });
}
