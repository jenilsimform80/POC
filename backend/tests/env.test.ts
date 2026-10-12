import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env.js';

const DB = 'postgresql://u:p@localhost:5432/db';

describe('loadEnv', () => {
  it('applies defaults', () => {
    const env = loadEnv({ DATABASE_URL: DB });

    expect(env.NODE_ENV).toBe('production'); // fail-safe default (see hardening.test.ts)
    expect(env.PORT).toBe(3000);
    expect(env.CORS_ORIGIN).toEqual(['http://localhost:5173']);
  });

  it('coerces PORT and splits CORS_ORIGIN', () => {
    const env = loadEnv({
      DATABASE_URL: DB,
      PORT: '4000',
      CORS_ORIGIN: 'http://a.test, http://b.test',
    });

    expect(env.PORT).toBe(4000);
    expect(env.CORS_ORIGIN).toEqual(['http://a.test', 'http://b.test']);
  });

  it('rejects an invalid PORT', () => {
    expect(() => loadEnv({ DATABASE_URL: DB, PORT: 'abc' })).toThrow(
      /Invalid environment configuration: PORT/,
    );
    expect(() => loadEnv({ DATABASE_URL: DB, PORT: '70000' })).toThrow(/PORT/);
  });

  it('rejects an invalid NODE_ENV', () => {
    expect(() => loadEnv({ DATABASE_URL: DB, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  it('requires a PostgreSQL DATABASE_URL', () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
    expect(() => loadEnv({ DATABASE_URL: 'mysql://x' })).toThrow(/DATABASE_URL/);
  });

  it('applies session and rate-limit defaults and rejects invalid values', () => {
    const env = loadEnv({ DATABASE_URL: DB });

    expect(env.SESSION_TTL_HOURS).toBe(8);
    expect(env.LOGIN_RATE_LIMIT_MAX).toBe(10);
    expect(() => loadEnv({ DATABASE_URL: DB, SESSION_TTL_HOURS: '0' })).toThrow(
      /SESSION_TTL_HOURS/,
    );
  });
});
