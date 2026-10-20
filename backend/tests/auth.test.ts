import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { signAccessToken } from '../src/auth/access-token.js';
import { createSession, hashToken } from '../src/auth/session.service.js';
import {
  buildTestApp,
  createTestPrisma,
  createUser,
  resetDatabase,
  TEST_PASSWORD,
  testEnv,
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

interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
  user: Record<string, unknown>;
}
const tokensOf = (res: request.Response) => res.body as Tokens;
const bearer = (res: request.Response) => `Bearer ${tokensOf(res).accessToken}`;
const refreshWith = (refreshToken: string, target = app) =>
  request(target).post('/api/auth/refresh').send({ refreshToken });

describe('POST /api/auth/login', () => {
  it('returns the user and a bearer token pair, and sets no cookie', async () => {
    const res = await login();

    expect(res.status).toBe(200);
    const body = tokensOf(res);
    expect(body.user).toMatchObject({ email: 'dev@test.dev', name: 'Dev', role: 'CONTRIBUTOR' });
    expect(JSON.stringify(body)).not.toMatch(/passwordHash|password_hash|argon2/);
    expect(body.tokenType).toBe('Bearer');
    expect(body.expiresIn).toBe(15 * 60);
    expect(body.accessToken.split('.')).toHaveLength(3); // a JWT
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('issues a JWT with only sub and sid claims, signed HS256', async () => {
    const { accessToken } = tokensOf(await login());
    const [header, payload] = accessToken
      .split('.')
      .slice(0, 2)
      .map(
        (part) => JSON.parse(Buffer.from(part, 'base64url').toString()) as Record<string, unknown>,
      );

    expect(header).toMatchObject({ alg: 'HS256' });
    expect(Object.keys(payload!).sort()).toEqual(['aud', 'exp', 'iat', 'iss', 'sid', 'sub']);
    expect(JSON.stringify(payload)).not.toContain('dev@test.dev'); // no PII in the token
  });

  it('stores only a hash of the refresh token, and an argon2id password hash', async () => {
    const { refreshToken } = tokensOf(await login());

    const sessions = await prisma.session.findMany();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.tokenHash).toBe(hashToken(refreshToken));
    expect(sessions[0]!.tokenHash).not.toContain(refreshToken);

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
      expect((res.body as Partial<Tokens>).accessToken).toBeUndefined();
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

  it('creates an independent session per login (two devices stay signed in)', async () => {
    const first = await login();
    const second = await login();

    expect(tokensOf(second).refreshToken).not.toBe(tokensOf(first).refreshToken);
    expect(await prisma.session.count()).toBe(2);
    expect(
      (await request(app).get('/api/auth/me').set('Authorization', bearer(first))).status,
    ).toBe(200);
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
  it('rejects requests without a token, with a WWW-Authenticate challenge', async () => {
    const res = await request(app).get('/api/auth/me');

    expect(res.status).toBe(401);
    expect((res.body as ApiErrorBody).error.code).toBe('UNAUTHENTICATED');
    expect(res.headers['www-authenticate']).toBe('Bearer');
  });

  it('returns the current user for a valid access token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', bearer(await login()));

    expect(res.status).toBe(200);
    expect((res.body as { user: { email: string } }).user.email).toBe('dev@test.dev');
  });

  it('rejects malformed Authorization headers and other schemes', async () => {
    const good = tokensOf(await login()).accessToken;
    for (const header of [
      'Bearer',
      'Bearer ',
      'Bearer not-a-jwt',
      `Basic ${good}`,
      `bearer-${good}`,
      `Bearer ${good} extra`,
      good, // missing scheme
    ]) {
      expect((await request(app).get('/api/auth/me').set('Authorization', header)).status).toBe(
        401,
      );
    }
  });

  it('rejects the refresh token used as an access token', async () => {
    const { refreshToken } = tokensOf(await login());
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${refreshToken}`);

    expect(res.status).toBe(401);
  });

  it('rejects a token signed with another secret, an unsigned token, and a tampered payload', async () => {
    const real = tokensOf(await login()).accessToken;
    const claims = {
      userId: (await prisma.user.findFirstOrThrow()).id,
      sessionId: (await prisma.session.findFirstOrThrow()).id,
    };

    const forged = (await signAccessToken('another-secret-another-secret-another', claims, 15))
      .token;
    const [h, p] = real.split('.');
    const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${p}.`;
    const tampered = `${h}.${Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p!, 'base64url').toString()), sub: 'x' })).toString('base64url')}.${real.split('.')[2]}`;

    for (const token of [forged, none, tampered]) {
      expect(
        (await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`)).status,
      ).toBe(401);
    }
  });

  it('rejects an expired access token', async () => {
    const claims = { userId: (await prisma.user.findFirstOrThrow()).id, sessionId: 'x' };
    const { sessionId } = await createSession(prisma, claims.userId, 8);
    const old = new Date(Date.now() - 2 * 3_600_000);
    const { token } = await signAccessToken(testEnv.JWT_SECRET, { ...claims, sessionId }, 15, old);

    expect(
      (await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`)).status,
    ).toBe(401);
  });

  it('rejects and removes an access token whose session has expired', async () => {
    const auth = bearer(await login());
    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

    const res = await request(app).get('/api/auth/me').set('Authorization', auth);

    expect(res.status).toBe(401);
    expect(await prisma.session.count()).toBe(0);
  });

  it('rejects a still-valid access token once the user is deactivated', async () => {
    const auth = bearer(await login());
    await prisma.user.updateMany({ data: { isActive: false } });

    expect((await request(app).get('/api/auth/me').set('Authorization', auth)).status).toBe(401);
  });

  it('does not accept the token from a cookie, query string or body', async () => {
    const { accessToken } = tokensOf(await login());

    expect(
      (await request(app).get('/api/auth/me').set('Cookie', `sid=${accessToken}`)).status,
    ).toBe(401);
    expect((await request(app).get(`/api/auth/me?access_token=${accessToken}`)).status).toBe(401);
  });
});

describe('POST /api/auth/refresh', () => {
  it('returns a new token pair, and the old refresh token stops working (rotation)', async () => {
    const first = tokensOf(await login());

    const res = await refreshWith(first.refreshToken);

    expect(res.status).toBe(200);
    const next = tokensOf(res);
    expect(next.refreshToken).not.toBe(first.refreshToken);
    expect(next.user).toMatchObject({ email: 'dev@test.dev' });
    expect((await request(app).get('/api/auth/me').set('Authorization', bearer(res))).status).toBe(
      200,
    );
    expect((await refreshWith(first.refreshToken)).status).toBe(401); // replay of the old one
    expect((await refreshWith(next.refreshToken)).status).toBe(200); // the new one works
    expect(await prisma.session.count()).toBe(1); // same session, rotated in place
  });

  it('lets only one of two concurrent refreshes with the same token succeed', async () => {
    const { refreshToken } = tokensOf(await login());

    const results = await Promise.all([refreshWith(refreshToken), refreshWith(refreshToken)]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
  });

  it('does not extend the absolute session lifetime', async () => {
    const { refreshToken } = tokensOf(await login());
    const before = (await prisma.session.findFirstOrThrow()).expiresAt;

    await refreshWith(refreshToken);

    expect((await prisma.session.findFirstOrThrow()).expiresAt).toEqual(before);
  });

  it('rejects unknown, expired and deactivated-user refresh tokens with the same 401', async () => {
    const { refreshToken } = tokensOf(await login());
    const unknown = await refreshWith('not-a-real-refresh-token');

    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    const expired = await refreshWith(refreshToken);

    const again = tokensOf(await login());
    await prisma.user.updateMany({ data: { isActive: false } });
    const deactivated = await refreshWith(again.refreshToken);

    for (const res of [unknown, expired, deactivated]) {
      expect(res.status).toBe(401);
      expect((res.body as ApiErrorBody).error.code).toBe('UNAUTHENTICATED');
    }
    expect(
      await prisma.session.count({ where: { tokenHash: hashToken(again.refreshToken) } }),
    ).toBe(0);
  });

  it('rejects an access token presented as a refresh token, and validates the body', async () => {
    const { accessToken } = tokensOf(await login());

    // Rejected either way: too long for a refresh token (400) or simply unknown (401).
    expect([400, 401]).toContain((await refreshWith(accessToken)).status);
    expect((await request(app).post('/api/auth/refresh').send({})).status).toBe(400);
    expect((await request(app).post('/api/auth/refresh').send({ refreshToken: 1 })).status).toBe(
      400,
    );
    expect(
      (await request(app).post('/api/auth/refresh').send({ refreshToken: 'a', extra: 1 })).status,
    ).toBe(400);
  });

  it('counts toward the coarse per-IP attempt limit', async () => {
    const limited = buildTestApp(prisma, { LOGIN_ATTEMPT_LIMIT_MAX: 2 });

    expect((await refreshWith('a', limited)).status).toBe(401);
    expect((await refreshWith('b', limited)).status).toBe(401);
    expect((await refreshWith('c', limited)).status).toBe(429);
  });
});

describe('POST /api/auth/logout', () => {
  it('destroys the session server-side: access AND refresh tokens die at once', async () => {
    const res = await login();
    const { refreshToken } = tokensOf(res);

    const out = await request(app).post('/api/auth/logout').send({ refreshToken });

    expect(out.status).toBe(204);
    expect(await prisma.session.count()).toBe(0);
    // A copied access token is dead even though its JWT has not expired.
    expect((await request(app).get('/api/auth/me').set('Authorization', bearer(res))).status).toBe(
      401,
    );
    expect((await refreshWith(refreshToken)).status).toBe(401);
  });

  it('is idempotent and does not reveal whether the token existed', async () => {
    const out = await request(app).post('/api/auth/logout').send({ refreshToken: 'nope' });

    expect(out.status).toBe(204);
  });

  it("cannot end another user's session without their refresh token", async () => {
    await login();

    expect((await request(app).post('/api/auth/logout').send({})).status).toBe(400);
    expect(await prisma.session.count()).toBe(1);
  });
});

describe('no CSRF surface', () => {
  it('ignores Origin: a bearer header is not sent automatically by a browser, so there is no CSRF to block', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Origin', 'http://evil.test')
      .send({ email: 'dev@test.dev', password: TEST_PASSWORD });

    expect(res.status).toBe(200); // the browser's CORS policy, not the server, stops evil.test reading it
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
