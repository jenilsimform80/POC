import { expect, test } from '@playwright/test';
import {
  USERS,
  createEntry,
  createProject,
  newSession,
  nav,
  uiSignOut,
  uniqueCode,
} from './support/helpers';

/** Security properties of the integrated system, checked from a real browser session. */
// The session cookie is `sid` in development and `__Host-sid` (Secure) in production.
const SID = process.env['E2E_COOKIE_NAME'] ?? 'sid';

test.describe('security', () => {
  const code = uniqueCode('SEC');
  const data = { projectId: '', taskId: '', dev2Entry: '', dev2Id: '' };

  test.beforeAll(async ({ browser }) => {
    const admin = await newSession(browser, 'admin');
    const ids = await createProject(admin.context.request, code);
    Object.assign(data, ids);
    await admin.context.close();
    const dev2 = await newSession(browser, 'dev2');
    data.dev2Id = (
      (await (await dev2.context.request.get('/api/auth/me')).json()) as { user: { id: string } }
    ).user.id;
    data.dev2Entry = await createEntry(dev2.context.request, {
      ...ids,
      workDate: '2027-02-02',
      hours: 3,
      notes: 'private to dev2',
    });
    await dev2.context.close();
  });

  test('every API area refuses anonymous callers', async ({ playwright, baseURL }) => {
    const anonymous = await playwright.request.newContext({ baseURL });
    for (const path of [
      '/api/users',
      '/api/projects',
      '/api/time-entries?from=2027-01-01&to=2027-01-31',
      '/api/timesheets/2027-02-01',
      '/api/submissions',
      '/api/locked-periods',
      '/api/audit-logs',
      '/api/reports/hours?from=2027-01-01&to=2027-01-31&groupBy=month',
      '/api/reports/project-budgets',
    ]) {
      const res = await anonymous.get(path);
      expect(res.status(), path).toBe(401);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
        'UNAUTHENTICATED',
      );
    }
    await anonymous.dispose();
  });

  test('the session cookie is HttpOnly + SameSite=Lax and cannot be read by page scripts', async ({
    browser,
  }) => {
    const { context, page } = await newSession(browser, 'dev1');
    await page.goto('/');
    const cookie = (await context.cookies()).find((c) => c.name === SID);
    expect(cookie).toMatchObject({
      httpOnly: true,
      sameSite: 'Lax',
      path: '/',
      secure: SID.startsWith('__Host-'),
    });

    const visible = await page.evaluate(() => document.cookie);
    expect(visible).not.toContain('sid=');
    const storage = await page.evaluate(
      () => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }),
    );
    expect(storage).not.toContain(cookie?.value ?? 'x');
    await context.close();
  });

  test('signing out ends the session on the server: a replayed cookie is dead', async ({
    browser,
    playwright,
    baseURL,
  }) => {
    const { context, page } = await newSession(browser, 'dev1');
    await page.goto('/');
    const stolen = (await context.cookies()).find((c) => c.name === SID)!.value;

    await uiSignOut(page);

    const replay = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { Cookie: `${SID}=${stolen}` },
    });
    expect((await replay.get('/api/auth/me')).status()).toBe(401);
    await replay.dispose();
    await context.close();
  });

  test('a contributor cannot read or change another contributor’s entry, even with the exact id', async ({
    browser,
  }) => {
    const dev1 = await newSession(browser, 'dev1');
    const api = dev1.context.request;

    expect((await api.get(`/api/time-entries/${data.dev2Entry}`)).status()).toBe(404);
    expect(
      (await api.patch(`/api/time-entries/${data.dev2Entry}`, { data: { hours: 1 } })).status(),
    ).toBe(404);
    expect((await api.delete(`/api/time-entries/${data.dev2Entry}`)).status()).toBe(404);
    const list = await api.get('/api/time-entries?from=2027-02-01&to=2027-02-28');
    expect(((await list.json()) as { entries: unknown[] }).entries).toHaveLength(0);
    expect((await api.get(`/api/users/${data.dev2Id}`)).status()).toBe(404);
    expect(
      (
        await api.get(`/api/time-entries?from=2027-02-01&to=2027-02-28&userId=${data.dev2Id}`)
      ).status(),
    ).toBe(404);
    await dev1.context.close();
  });

  test('managers see their reports only; admin-only APIs are 403 for everyone else', async ({
    browser,
  }) => {
    const other = await newSession(browser, 'otherManager');
    expect((await other.context.request.get(`/api/time-entries/${data.dev2Entry}`)).status()).toBe(
      404,
    ); // not their report
    const users = (await (await other.context.request.get('/api/users')).json()) as {
      users: { email: string }[];
    };
    expect(users.users.map((u) => u.email)).toEqual([USERS.otherManager]); // only themself
    await other.context.close();

    for (const who of ['dev1', 'manager'] as const) {
      const s = await newSession(browser, who);
      for (const [method, path] of [
        ['GET', '/api/audit-logs'],
        ['GET', '/api/reports/project-budgets'],
        ['POST', '/api/locked-periods'],
        ['POST', '/api/projects'],
      ] as const) {
        const res =
          method === 'GET'
            ? await s.context.request.get(path)
            : await s.context.request.post(path, { data: {} });
        expect(res.status(), `${who} ${method} ${path}`).toBe(403);
      }
      await s.context.close();
    }
  });

  test('admins cannot approve timesheets; only the owner’s manager can', async ({ browser }) => {
    const dev1 = await newSession(browser, 'dev1');
    await createEntry(dev1.context.request, {
      projectId: data.projectId,
      taskId: data.taskId,
      workDate: '2027-03-02',
      hours: 2,
    });
    const sub = await dev1.context.request.post('/api/submissions', {
      data: { weekStart: '2027-03-01' },
    });
    expect(sub.status()).toBe(201);
    const id = ((await sub.json()) as { submission: { id: string } }).submission.id;
    await dev1.context.close();

    const admin = await newSession(browser, 'admin');
    expect(
      (await admin.context.request.post(`/api/submissions/${id}/approve`, { data: {} })).status(),
    ).toBe(403);
    await admin.context.close();
    const other = await newSession(browser, 'otherManager');
    expect(
      (await other.context.request.post(`/api/submissions/${id}/approve`, { data: {} })).status(),
    ).toBe(404);
    await other.context.close();
    const manager = await newSession(browser, 'manager');
    expect(
      (await manager.context.request.post(`/api/submissions/${id}/approve`, { data: {} })).status(),
    ).toBe(200);
    await manager.context.close();
  });

  test('cross-site writes are refused: a foreign Origin gets 403 even with a valid session', async ({
    browser,
    baseURL,
  }) => {
    const { context } = await newSession(browser, 'dev1');
    const body = {
      projectId: data.projectId,
      taskId: data.taskId,
      workDate: '2027-04-06',
      hours: 1,
      isBillable: true,
    };

    const evil = await context.request.post('/api/time-entries', {
      data: body,
      headers: { Origin: 'https://evil.example' },
    });
    const nullOrigin = await context.request.post('/api/time-entries', {
      data: body,
      headers: { Origin: 'null' },
    });
    const ours = await context.request.post('/api/time-entries', {
      data: body,
      headers: { Origin: new URL(baseURL ?? 'http://127.0.0.1:5173').origin },
    });

    expect(evil.status()).toBe(403);
    expect(nullOrigin.status()).toBe(403);
    expect(ours.status()).toBe(201);
    await context.close();
  });

  test('screens hide what a role cannot use, and guarded pages say so', async ({ browser }) => {
    const manager = await newSession(browser, 'manager');
    await manager.page.goto('/');
    await expect(nav(manager.page, 'Approvals')).toBeVisible();
    await expect(nav(manager.page, 'Locked periods')).toHaveCount(0);
    await manager.page.goto('/periods');
    await expect(manager.page.getByText("You don't have access to this page")).toBeVisible();
    await manager.context.close();

    const dev = await newSession(browser, 'dev1');
    await dev.page.goto('/approvals');
    await expect(dev.page.getByText("You don't have access to this page")).toBeVisible();
    await dev.page.goto('/projects');
    await expect(dev.page.getByText('Budget')).toHaveCount(0); // allocated hours are admin-only
    await dev.context.close();
  });

  test('user-supplied text is rendered as text, never executed', async ({ browser }) => {
    const dev = await newSession(browser, 'dev1');
    const payload = '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>';
    await createEntry(dev.context.request, {
      projectId: data.projectId,
      taskId: data.taskId,
      workDate: '2027-05-18',
      hours: 1,
      notes: payload,
    });

    await dev.page.goto('/timesheet?week=2027-05-17');

    await expect(dev.page.getByText(payload, { exact: true })).toBeVisible();
    expect(
      await dev.page.evaluate(() => (window as unknown as { __xss?: number }).__xss),
    ).toBeUndefined();
    await expect(dev.page.locator('main img')).toHaveCount(0);
    await dev.context.close();
  });

  test('hostile input is answered with 4xx (NUL bytes, oversized and malformed bodies), never 500', async ({
    browser,
  }) => {
    const { context } = await newSession(browser, 'dev1');
    const api = context.request;
    const entry = {
      projectId: data.projectId,
      taskId: data.taskId,
      workDate: '2027-06-08',
      hours: 1,
      isBillable: true,
    };

    expect(
      (await api.post('/api/time-entries', { data: { ...entry, notes: 'a\u0000b' } })).status(),
    ).toBe(400);
    expect(
      (
        await api.post('/api/time-entries', { data: { ...entry, notes: 'x'.repeat(200_000) } })
      ).status(),
    ).toBe(413);
    expect(
      (
        await api.post('/api/time-entries', {
          headers: { 'Content-Type': 'application/json' },
          data: '{"a":',
        })
      ).status(),
    ).toBe(400);
    expect((await api.get('/api/projects/%00')).status()).toBe(400);
    expect((await api.get('/api/timesheets/9999-12-27')).status()).toBe(400);
    expect((await api.get('/api/auth/me')).status()).toBe(200); // the session survived all of that
    await context.close();
  });

  test('API responses are not cacheable', async ({ browser }) => {
    const { context } = await newSession(browser, 'admin');
    const res = await context.request.get('/api/projects');

    expect(res.headers()['cache-control']).toBe('no-store');
    expect(res.headers()['vary']).toMatch(/Cookie/i);
    expect(res.headers()['etag']).toBeUndefined();
    expect(res.headers()['x-powered-by']).toBeUndefined();
    expect(res.headers()['x-content-type-options']).toBe('nosniff');
    await context.close();
  });

  test('wrong-password login does not reveal whether the account exists', async ({ page }) => {
    const attempt = async (email: string) => {
      await page.goto('/login');
      await page.getByLabel('Email').fill(email);
      await page.getByLabel('Password', { exact: true }).fill('wrong-wrong-wrong');
      await page.getByRole('button', { name: 'Sign in' }).click();
      return (await page.getByRole('alert').textContent()) ?? '';
    };

    expect(await attempt(USERS.dev1)).toBe(await attempt('nobody@example.com'));
  });
});
