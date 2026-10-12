import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env.js';
import {
  buildTestApp,
  createProjectWithTask,
  createTestPrisma,
  createUser,
  loginCookie,
  resetDatabase,
  TEST_PASSWORD,
} from './helpers.js';

// Regression tests for the Phase 9 independent security review.
const prisma = createTestPrisma();
const DB = 'postgresql://u:p@localhost:5432/db';

beforeEach(async () => {
  await resetDatabase(prisma);
  await createUser(prisma, { email: 'admin@t.dev', role: 'ADMIN' });
  const ma = await createUser(prisma, { email: 'ma@t.dev', role: 'MANAGER' });
  await createUser(prisma, { email: 'dev@t.dev', managerId: ma.id });
  await createProjectWithTask(prisma, { code: 'P1', budgetHours: 250 });
});
afterAll(async () => {
  await resetDatabase(prisma);
  await prisma.$disconnect();
});

describe('authenticated responses must not be cached (finding 3)', () => {
  it('sets no-store and Vary: Cookie on API responses, success and error alike', async () => {
    const app = buildTestApp(prisma);
    const cookie = await loginCookie(app, 'admin@t.dev');

    const ok = await request(app).get('/api/projects').set('Cookie', cookie);
    const denied = await request(app).get('/api/projects');
    const notFound = await request(app).get('/api/nope');

    for (const res of [ok, denied, notFound]) {
      expect(res.headers['cache-control']).toBe('no-store');
      expect(String(res.headers['vary'])).toMatch(/Cookie/i);
    }
    expect(ok.status).toBe(200);
  });

  it('does not emit an ETag, so there is no conditional-request cache path either', async () => {
    const app = buildTestApp(prisma);
    const cookie = await loginCookie(app, 'admin@t.dev');

    const res = await request(app).get('/api/projects').set('Cookie', cookie);

    expect(res.headers['etag']).toBeUndefined();
  });
});

describe('fail-safe environment (finding 2)', () => {
  it('defaults NODE_ENV to production, so a forgotten variable can never weaken cookies', () => {
    expect(loadEnv({ DATABASE_URL: DB }).NODE_ENV).toBe('production');
  });

  it('issues a Secure cookie when NODE_ENV is not set explicitly', async () => {
    const env = loadEnv({ DATABASE_URL: DB });
    const app = buildTestApp(prisma, { NODE_ENV: env.NODE_ENV });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'dev@t.dev', password: TEST_PASSWORD });

    expect(String(res.headers['set-cookie'])).toMatch(/Secure/i);
  });
});

describe('session cookie name (finding 5)', () => {
  it('uses the __Host- prefix in production (Secure, Path=/, no Domain) and sid otherwise', async () => {
    const prod = await request(buildTestApp(prisma, { NODE_ENV: 'production' }))
      .post('/api/auth/login')
      .send({ email: 'dev@t.dev', password: TEST_PASSWORD });
    const dev = await request(buildTestApp(prisma, { NODE_ENV: 'development' }))
      .post('/api/auth/login')
      .send({ email: 'dev@t.dev', password: TEST_PASSWORD });

    const prodCookie = String((prod.headers['set-cookie'] as unknown as string[])[0]);
    expect(prodCookie).toMatch(/^__Host-sid=/);
    expect(prodCookie).toMatch(/Secure/);
    expect(prodCookie).toMatch(/Path=\//);
    expect(prodCookie).not.toMatch(/Domain=/i);
    expect(String((dev.headers['set-cookie'] as unknown as string[])[0])).toMatch(/^sid=/);
  });

  it('authenticates with the prefixed cookie in production and ignores a plain "sid" cookie there', async () => {
    const app = buildTestApp(prisma, { NODE_ENV: 'production' });
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'dev@t.dev', password: TEST_PASSWORD });
    const pair = String((login.headers['set-cookie'] as unknown as string[])[0]).split(';')[0]!;
    const token = pair.slice('__Host-sid='.length);

    const prefixed = await request(app).get('/api/auth/me').set('Cookie', pair);
    const plain = await request(app).get('/api/auth/me').set('Cookie', `sid=${token}`); // e.g. planted by a sibling subdomain

    expect(prefixed.status).toBe(200);
    expect(plain.status).toBe(401);
  });
});

describe('login throttling behind a reverse proxy (finding 1)', () => {
  const tryLogin = (app: ReturnType<typeof buildTestApp>, ip: string) =>
    request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', ip)
      .send({ email: 'dev@t.dev', password: 'wrong-password' });

  it('ignores X-Forwarded-For by default: spoofing the header cannot dodge the limit', async () => {
    const app = buildTestApp(prisma, { LOGIN_RATE_LIMIT_MAX: 2 });

    const statuses = [];
    for (const ip of ['1.1.1.1', '2.2.2.2', '3.3.3.3', '4.4.4.4'])
      statuses.push((await tryLogin(app, ip)).status);

    expect(statuses).toEqual([401, 401, 429, 429]);
  });

  it('with TRUST_PROXY=1 counts per real client address (the proxy-appended hop), not per proxy', async () => {
    const app = buildTestApp(prisma, { LOGIN_RATE_LIMIT_MAX: 2, TRUST_PROXY: 1 });

    const a = [
      (await tryLogin(app, '9.9.9.1')).status,
      (await tryLogin(app, '9.9.9.1')).status,
      (await tryLogin(app, '9.9.9.1')).status,
    ];
    const other = (await tryLogin(app, '9.9.9.2')).status;

    expect(a).toEqual([401, 401, 429]); // client 1 is throttled
    expect(other).toBe(401); // client 2 is not punished for client 1's failures
  });

  it('rejects a trust proxy value of "true" (client-controlled header would defeat the limiter)', () => {
    expect(() => loadEnv({ DATABASE_URL: DB, TRUST_PROXY: 'true' })).toThrow(/TRUST_PROXY/);
    expect(loadEnv({ DATABASE_URL: DB, TRUST_PROXY: '1' }).TRUST_PROXY).toBe(1);
    expect(loadEnv({ DATABASE_URL: DB }).TRUST_PROXY).toBe(0);
  });
});

describe('successful logins are bounded too (finding 4)', () => {
  it('blocks an IP that hammers the login endpoint even with correct credentials', async () => {
    const app = buildTestApp(prisma, { LOGIN_ATTEMPT_LIMIT_MAX: 3 });

    const statuses = [];
    for (let i = 0; i < 5; i++) {
      statuses.push(
        (
          await request(app)
            .post('/api/auth/login')
            .send({ email: 'dev@t.dev', password: TEST_PASSWORD })
        ).status,
      );
    }

    expect(statuses).toEqual([200, 200, 200, 429, 429]);
  });
});

describe('project budgets are admin information (finding 6)', () => {
  it('hides budgetHours from non-admins in the project list and detail, but not from admins', async () => {
    const app = buildTestApp(prisma);
    const admin = await loginCookie(app, 'admin@t.dev');
    const dev = await loginCookie(app, 'dev@t.dev');
    const ma = await loginCookie(app, 'ma@t.dev');
    const id = (await prisma.project.findUniqueOrThrow({ where: { code: 'P1' } })).id;

    const adminList = (await request(app).get('/api/projects').set('Cookie', admin)).body as {
      projects: Record<string, unknown>[];
    };
    expect(adminList.projects[0]).toMatchObject({ budgetHours: 250, code: 'P1' });

    for (const cookie of [dev, ma]) {
      const list = (await request(app).get('/api/projects').set('Cookie', cookie)).body as {
        projects: Record<string, unknown>[];
      };
      const one = (await request(app).get(`/api/projects/${id}`).set('Cookie', cookie)).body as {
        project: Record<string, unknown>;
      };
      expect(list.projects[0]).toMatchObject({ code: 'P1', name: 'Project P1' });
      expect(list.projects[0]).not.toHaveProperty('budgetHours');
      expect(one.project).not.toHaveProperty('budgetHours');
      expect(JSON.stringify(list)).not.toContain('250');
    }
  });
});
