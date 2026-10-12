import { describe, expect, it } from 'vitest';
import { ApiError } from '../src/api/errors';
import { getDatabaseHealth, getHealth } from '../src/api/health';
import { dbDown, dbUp, fail, healthOk, jsonResponse, mockApi } from './helpers';

describe('health API', () => {
  it('getHealth returns the payload', async () => {
    mockApi({ 'GET /health': healthOk() });

    await expect(getHealth()).resolves.toMatchObject({ status: 'ok', uptimeSeconds: 42 });
  });

  it('getDatabaseHealth returns "up"', async () => {
    mockApi({ 'GET /health/db': dbUp() });

    await expect(getDatabaseHealth()).resolves.toEqual({ status: 'ok', database: 'up' });
  });

  it('getDatabaseHealth returns the 503 "down" answer as data, not as an error', async () => {
    mockApi({ 'GET /health/db': dbDown() });

    await expect(getDatabaseHealth()).resolves.toEqual({ status: 'unavailable', database: 'down' });
  });

  it('getDatabaseHealth still throws for any other failure', async () => {
    mockApi({ 'GET /health/db': fail(500, 'INTERNAL_ERROR', 'An unexpected error occurred') });

    await expect(getDatabaseHealth()).rejects.toBeInstanceOf(ApiError);
  });

  it('getDatabaseHealth does not mistake a 503 without the expected shape for "down"', async () => {
    mockApi({ 'GET /health/db': jsonResponse({ something: 'else' }, 503) });

    await expect(getDatabaseHealth()).rejects.toMatchObject({
      status: 503,
      code: 'UNEXPECTED_RESPONSE',
    });
  });
});
