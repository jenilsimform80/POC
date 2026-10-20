import { expect, test } from '@playwright/test';
import {
  USERS,
  createEntry,
  createProject,
  newSession,
  apiOrigin,
  appGoto,
  apiLoginTokens,
  nav,
  password,
  uiSignOut,
  uniqueCode,
} from './support/helpers';

/** Security properties of the integrated system, checked from a real browser session. */

test.describe('security', () => {
  const code = uniqueCode('SEC');
  const data = { projectId: '', taskId: '', dev2Entry: '', dev2Id: '' };

  test.beforeAll(async ({ browser }) => {
    const admin = await newSession(browser, 'admin');
    const ids = await createProject(admin.api, code);
    Object.assign(data, ids);
    await admin.context.close();
    const dev2 = await newSession(browser, 'dev2');
    data.dev2Id = (
      (await (await dev2.api.get('/api/auth/me')).json()) as { user: { id: string } }
    ).user.id;
    data.dev2Entry = await createEntry(dev2.api, {
      ...ids,
      workDate: '2027-02-02',
      hours: 3,
      notes: 'private to dev2',
    });
    await dev2.context.close();
  });

  test('every API area refuses anonymous callers', async ({ playwright }) => {
    const anonymous = await playwright.request.newContext({ baseURL: apiOrigin() });
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

  test('tokens are memory-only: not in cookies or web storage, and a reload signs out', async ({
    browser,
  }) => {
    const { context, page } = await newSession(browser, 'dev1');

    const visible = await page.evaluate(() => ({
      cookie: document.cookie,
      storage: JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }),
    }));
    expect(visible.cookie).toBe('');
    expect(visible.storage).not.toMatch(/eyJ|token/i); // no JWT, no refresh token
    expect(await context.cookies()).toEqual([]);

    await page.reload(); // memory is gone: the price of keeping tokens out of reach of storage reads
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await context.close();
  });

  test('signing out ends the session on the server: copied tokens are dead', async ({
    browser,
    playwright,
  }) => {
    // Sign in through the API so the test holds both tokens, exactly like an attacker who copied them.
    const anonymous = await playwright.request.newContext({ baseURL: apiOrigin() });
    const stolen = await apiLoginTokens(anonymous, USERS.dev1);
    const asStolen = await playwright.request.newContext({
      baseURL: apiOrigin(),
      extraHTTPHeaders: { Authorization: `Bearer ${stolen.accessToken}` },
    });
    expect((await asStolen.get('/api/auth/me')).status()).toBe(200);

    const out = await anonymous.post('/api/auth/logout', {
      data: { refreshToken: stolen.refreshToken },
    });

    expect(out.status()).toBe(204);
    expect((await asStolen.get('/api/auth/me')).status()).toBe(401); // JWT unexpired, session gone
    expect(
      (
        await anonymous.post('/api/auth/refresh', { data: { refreshToken: stolen.refreshToken } })
      ).status(),
    ).toBe(401);
    await asStolen.dispose();
    await anonymous.dispose();

    // And through the UI: Sign out also removes the tokens from memory.
    const { context, page } = await newSession(browser, 'dev1');
    await uiSignOut(page);
    await appGoto(page, '/timesheet');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await context.close();
  });

  test('a contributor cannot read or change another contributor’s entry, even with the exact id', async ({
    browser,
  }) => {
    const dev1 = await newSession(browser, 'dev1');
    const api = dev1.api;
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
    expect((await other.api.get(`/api/time-entries/${data.dev2Entry}`)).status()).toBe(404); // not their report
    const users = (await (await other.api.get('/api/users')).json()) as {
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
        const res = method === 'GET' ? await s.api.get(path) : await s.api.post(path, { data: {} });
        expect(res.status(), `${who} ${method} ${path}`).toBe(403);
      }
      await s.context.close();
    }
  });

  test('admins cannot approve timesheets; only the owner’s manager can', async ({ browser }) => {
    const dev1 = await newSession(browser, 'dev1');
    await createEntry(dev1.api, {
      projectId: data.projectId,
      taskId: data.taskId,
      workDate: '2027-03-02',
      hours: 2,
    });
    const sub = await dev1.api.post('/api/submissions', {
      data: { weekStart: '2027-03-01' },
    });
    expect(sub.status()).toBe(201);
    const id = ((await sub.json()) as { submission: { id: string } }).submission.id;
    await dev1.context.close();

    const admin = await newSession(browser, 'admin');
    expect((await admin.api.post(`/api/submissions/${id}/approve`, { data: {} })).status()).toBe(
      403,
    );
    await admin.context.close();
    const other = await newSession(browser, 'otherManager');
    expect((await other.api.post(`/api/submissions/${id}/approve`, { data: {} })).status()).toBe(
      404,
    );
    await other.context.close();
    const manager = await newSession(browser, 'manager');
    expect((await manager.api.post(`/api/submissions/${id}/approve`, { data: {} })).status()).toBe(
      200,
    );
    await manager.context.close();
  });

  test('credentials are never ambient: a request carrying no Authorization header is refused', async ({
    playwright,
  }) => {
    // A cross-site page can make the browser send cookies, but it cannot make it send a bearer
    // header; with no cookie auth at all there is nothing for a forged request to ride on.
    const anonymous = await playwright.request.newContext({ baseURL: apiOrigin() });
    await anonymous.post('/api/auth/login', {
      data: { email: USERS.dev1, password: password() },
      headers: { Origin: 'https://evil.example' },
    });
    const forged = await anonymous.post('/api/time-entries', {
      data: {
        projectId: data.projectId,
        taskId: data.taskId,
        workDate: '2027-04-06',
        hours: 1,
        isBillable: true,
      },
      headers: { Origin: 'https://evil.example' },
    });

    expect(forged.status()).toBe(401);
    expect((await anonymous.storageState()).cookies).toEqual([]);
    await anonymous.dispose();
  });

  test('screens hide what a role cannot use, and guarded pages say so', async ({ browser }) => {
    const manager = await newSession(browser, 'manager');
    await appGoto(manager.page, '/');
    await expect(nav(manager.page, 'Approvals')).toBeVisible();
    await expect(nav(manager.page, 'Locked periods')).toHaveCount(0);
    await appGoto(manager.page, '/periods');
    await expect(manager.page.getByText("You don't have access to this page")).toBeVisible();
    await manager.context.close();

    const dev = await newSession(browser, 'dev1');
    await appGoto(dev.page, '/approvals');
    await expect(dev.page.getByText("You don't have access to this page")).toBeVisible();
    await appGoto(dev.page, '/projects');
    await expect(dev.page.getByText('Budget')).toHaveCount(0); // allocated hours are admin-only
    await dev.context.close();
  });

  test('user-supplied text is rendered as text, never executed', async ({ browser }) => {
    const dev = await newSession(browser, 'dev1');
    const payload = '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>';
    await createEntry(dev.api, {
      projectId: data.projectId,
      taskId: data.taskId,
      workDate: '2027-05-18',
      hours: 1,
      notes: payload,
    });

    await appGoto(dev.page, '/timesheet?week=2027-05-17');

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
    const { context, api } = await newSession(browser, 'dev1');
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
    const { context, api } = await newSession(browser, 'admin');
    const res = await api.get('/api/projects');

    expect(res.headers()['cache-control']).toBe('no-store');
    expect(res.headers()['vary']).toMatch(/Authorization/i);
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
