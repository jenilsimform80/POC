import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppError } from '../src/errors/app-error.js';
import type { ApiErrorBody } from './helpers.js';
import { createErrorHandler } from '../src/middleware/error-handler.js';
import { getValidated, validate } from '../src/middleware/validate.js';

const bodySchema = z.object({ hours: z.number().positive().max(24) });
const querySchema = z.object({ page: z.coerce.number().int().min(1).default(1) });
const schemas = { body: bodySchema, query: querySchema };

function buildApp() {
  const app = express();
  app.use(express.json());
  app.post('/echo', validate(schemas), (_req, res) => {
    const { body, query } = getValidated<typeof schemas>(res);
    res.json({ hours: body.hours, page: query.page });
  });
  app.get('/app-error', () => {
    throw new AppError('PERIOD_LOCKED', 409, 'Period is locked', { period: '2026-01' });
  });
  app.get('/boom', () => {
    throw new Error('secret database detail');
  });
  app.use(createErrorHandler({ logErrors: false }));
  return app;
}

describe('validate middleware', () => {
  it('passes parsed and coerced values to the controller', async () => {
    const res = await request(buildApp()).post('/echo?page=2').send({ hours: 8 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ hours: 8, page: 2 });
  });

  it('rejects invalid input with a 400 and field details', async () => {
    const res = await request(buildApp()).post('/echo').send({ hours: 30 });

    expect(res.status).toBe(400);
    const { error } = res.body as ApiErrorBody;
    expect(error.code).toBe('VALIDATION_ERROR');
    expect((error.details as unknown[])[0]).toMatchObject({ location: 'body', path: 'hours' });
  });
});

describe('error handler', () => {
  it('serializes AppError with its status, code and details', async () => {
    const res = await request(buildApp()).get('/app-error');

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: { code: 'PERIOD_LOCKED', message: 'Period is locked', details: { period: '2026-01' } },
    });
  });

  it('returns a generic 500 without leaking internals', async () => {
    const res = await request(buildApp()).get('/boom');

    expect(res.status).toBe(500);
    expect((res.body as ApiErrorBody).error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('secret');
  });

  it('returns 400 for malformed JSON', async () => {
    const res = await request(buildApp())
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send('{bad json');

    expect(res.status).toBe(400);
    expect((res.body as ApiErrorBody).error.code).toBe('VALIDATION_ERROR');
  });
});
