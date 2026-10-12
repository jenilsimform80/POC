import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { hashToken } from '../src/auth/session.service.js';
import {
  buildTestApp,
  createTestPrisma,
  createUser,
  resetDatabase,
  TEST_PASSWORD,
  type ApiErrorBody,
} from './helpers.js';

const prisma = createTestPrisma();
const app = buildTestApp(prisma);

beforeEach(async () => {
  await resetDatabase(prisma);
  await createUser(prisma, { email: 'dev@test.dev', name: 'Dev' });
});
afterAll(async () => {
  await resetDatabase(prisma);
  await prisma.$disconnect();
});

const login = (email = 'dev@test.dev', password = TEST_PASSWORD, target = app) =>
  request(target).post('/api/auth/login').send({ email, password });

function cookieOf(res: request.Response): string {
  const header = res.headers['set-cookie'] as unknown as string[] | undefined;
  const sid = header?.find((c) => c.startsWith('sid='));
  if (!sid) throw new Error('no sid cookie set');
  return sid;
}
const tokenOf = (cookie: string) => cookie.split(';')[0]!.slice('sid='.length);

describe('POST /api/auth/login', () => {
  it('logs in, returns the user without secrets and sets a hardened cookie', async () => {
    const res = await login();

    expect(res.status).toBe(200);
    const body = res.body as { user: Record<string, unknown> };
    expect(body.user).toMatchObject({ email: 'dev@test.dev', name: 'Dev', role: 'CONTRIBUTOR' });
    expect(JSON.stringify(body)).not.toMatch(/passwordHash|password_hash|argon2/);

    const cookie = cookieOf(res);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(/Expires=/);
    expect(cookie).not.toMatch(/Secure/i); // only in production
  });

  it('marks the cookie Secure in production', async () => {
    const prod = buildTestApp(prisma, { NODE_ENV: 'production' });
    const res = await login('dev@test.dev', TEST_PASSWORD, prod);

    const header = res.headers['set-cookie'] as unknown as string[];
    expect(header[0]).toMatch(/^__Host-sid=/); // prefixed in production (see hardening.test.ts)
    expect(header[0]).toMatch(/Secure/i);
  });

  it('stores only a hash of the session token, and an argon2id password hash', async () => {
    const res = await login();
    const token = tokenOf(cookieOf(res));

    const sessions = await prisma.session.findMany();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.tokenHash).toBe(hashToken(token));
    expect(sessions[0]!.tokenHash).not.toContain(token);

    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'dev@test.dev' } });
    expect(user.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(user.passwordHash).not.toContain(TEST_PASSWORD);
  });

  it('is case-insensitive on email', async () => {
    expect((await login('  DEV@Test.DEV ')).status).toBe(200);
  });

  it('gives the same 401 for a wrong password, unknown email and inactive user', async () => {
    await createUser(prisma, { email: 'gone@test.dev', isActive: false });

    const wrong = await login('dev@test.dev', 'nope-nope');
    const unknown = await login('nobody@test.dev');
    const inactive = await login('gone@test.dev');

    for (const res of [wrong, unknown, inactive]) {
      expect(res.status).toBe(401);
      expect(res.headers['set-cookie']).toBeUndefined();
    }
    expect(unknown.body).toEqual(wrong.body);
    expect(inactive.body).toEqual(wrong.body);
    expect(await prisma.session.count()).toBe(0);
  });

  it('validates the body', async () => {
    const noPassword = await request(app).post('/api/auth/login').send({ email: 'dev@test.dev' });
    const badEmail = await request(app).post('/api/auth/login').send({ email: 'x', password: 'y' });

    expect(noPassword.status).toBe(400);
    expect((noPassword.body as ApiErrorBody).error.code).toBe('VALIDATION_ERROR');
    expect(badEmail.status).toBe(400);
  });

  it('issues a fresh token and deletes the old session when already logged in (no fixation)', async () => {
    const first = cookieOf(await login());
    const second = await request(app)
      .post('/api/auth/login')
      .set('Cookie', first)
      .send({ email: 'dev@test.dev', password: TEST_PASSWORD });

    expect(tokenOf(cookieOf(second))).not.toBe(tokenOf(first));
    expect(await prisma.session.count()).toBe(1);
    const me = await request(app).get('/api/auth/me').set('Cookie', first);
    expect(me.status).toBe(401);
  });
});

describe('login throttling', () => {
  it('blocks further attempts after too many failures, even with the right password', async () => {
    const limited = buildTestApp(prisma, { LOGIN_RATE_LIMIT_MAX: 3 });

    for (let i = 0; i < 3; i++) {
      expect((await login('dev@test.dev', 'wrong', limited)).status).toBe(401);
    }
    const blocked = await login('dev@test.dev', TEST_PASSWORD, limited);

    expect(blocked.status).toBe(429);
    expect((blocked.body as ApiErrorBody).error.code).toBe('RATE_LIMITED');
  });

  it('does not count successful logins', async () => {
    const limited = buildTestApp(prisma, { LOGIN_RATE_LIMIT_MAX: 2 });

    for (let i = 0; i < 5; i++) {
      expect((await login('dev@test.dev', TEST_PASSWORD, limited)).status).toBe(200);
    }
  });
});

describe('GET /api/auth/me', () => {
  it('rejects requests without a session', async () => {
    const res = await request(app).get('/api/auth/me');

    expect(res.status).toBe(401);
    expect((res.body as ApiErrorBody).error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a forged cookie', async () => {
    const res = await request(app).get('/api/auth/me').set('Cookie', 'sid=not-a-real-token');

    expect(res.status).toBe(401);
  });

  it('returns the current user for a valid session', async () => {
    const cookie = cookieOf(await login());
    const res = await request(app).get('/api/auth/me').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect((res.body as { user: { email: string } }).user.email).toBe('dev@test.dev');
  });

  it('rejects and removes an expired session', async () => {
    const cookie = cookieOf(await login());
    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

    const res = await request(app).get('/api/auth/me').set('Cookie', cookie);

    expect(res.status).toBe(401);
    expect(await prisma.session.count()).toBe(0);
  });

  it('rejects an existing session once the user is deactivated', async () => {
    const cookie = cookieOf(await login());
    await prisma.user.updateMany({ data: { isActive: false } });

    const res = await request(app).get('/api/auth/me').set('Cookie', cookie);

    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('destroys the session server-side and clears the cookie', async () => {
    const cookie = cookieOf(await login());

    const out = await request(app).post('/api/auth/logout').set('Cookie', cookie);

    expect(out.status).toBe(204);
    expect(String(out.headers['set-cookie'])).toMatch(/sid=;/);
    expect(await prisma.session.count()).toBe(0);
    // The old token is dead even if an attacker kept a copy of it.
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
  });

  it('is idempotent without a session', async () => {
    expect((await request(app).post('/api/auth/logout')).status).toBe(204);
  });
});

describe('CSRF origin check', () => {
  it('rejects state-changing requests from a foreign Origin', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Origin', 'http://evil.test')
      .send({ email: 'dev@test.dev', password: TEST_PASSWORD });

    expect(res.status).toBe(403);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('allows the configured frontend origin', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Origin', 'http://localhost:5173')
      .send({ email: 'dev@test.dev', password: TEST_PASSWORD });

    expect(res.status).toBe(200);
  });

  it('rejects a foreign-origin logout', async () => {
    const cookie = cookieOf(await login());
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', cookie)
      .set('Origin', 'http://evil.test');

    expect(res.status).toBe(403);
    expect(await prisma.session.count()).toBe(1);
  });
});
