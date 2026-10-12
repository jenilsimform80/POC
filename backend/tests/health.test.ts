import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { buildTestApp, createTestPrisma, createUnreachablePrisma } from './helpers.js';

interface HealthBody {
  status: string;
  uptimeSeconds: number;
  timestamp: string;
}

const prisma = createTestPrisma();
const app = buildTestApp(prisma);

afterAll(() => prisma.$disconnect());

describe('GET /api/health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    const body = res.body as HealthBody;
    expect(body.status).toBe('ok');
    expect(typeof body.uptimeSeconds).toBe('number');
    expect(new Date(body.timestamp).toString()).not.toBe('Invalid Date');
  });

  it('sets security headers and hides x-powered-by', async () => {
    const res = await request(app).get('/api/health');

    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('unknown routes', () => {
  it('returns a 404 in the standard error shape', async () => {
    const res = await request(app).get('/api/nope');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Route not found: GET /api/nope' },
    });
  });
});

describe('GET /api/health/db', () => {
  it('returns 200 when the database answers', async () => {
    const res = await request(app).get('/api/health/db');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', database: 'up' });
  });

  it('returns 503 without leaking details when the database is down', async () => {
    const unreachable = createUnreachablePrisma();
    const res = await request(buildTestApp(unreachable)).get('/api/health/db');
    await unreachable.$disconnect();

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'unavailable', database: 'down' });
  });
});
