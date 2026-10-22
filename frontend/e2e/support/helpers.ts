import {
  expect,
  request,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';

export const USERS = {
  admin: 'admin@example.com',
  manager: 'manager@example.com',
  otherManager: 'other.manager@example.com',
  dev1: 'dev1@example.com', // reports to `manager`
  dev2: 'dev2@example.com', // reports to `manager`
} as const;
export type UserKey = keyof typeof USERS;

export const password = (): string => {
  const value = process.env['E2E_PASSWORD'];
  if (!value) throw new Error('E2E_PASSWORD missing (set by global-setup)');
  return value;
};

/**
 * Where the API answers for Playwright's request clients. In the default dev stack that is the
 * backend itself (Vite does not proxy); against a production-like stack (E2E_EXTERNAL_SERVERS=1)
 * nginx serves SPA and `/api` from one origin. Override with E2E_API_ORIGIN.
 */
export const apiOrigin = (): string =>
  process.env['E2E_API_ORIGIN'] ??
  (process.env['E2E_EXTERNAL_SERVERS'] === '1'
    ? (process.env['E2E_BASE_URL'] ?? 'http://127.0.0.1:8080')
    : `http://127.0.0.1:${process.env['E2E_BACKEND_PORT'] ?? '3000'}`);

export interface ApiTokens {
  accessToken: string;
  refreshToken: string;
}

/** Signs in through the API and returns the bearer tokens (the API has no cookies any more). */
export async function apiLoginTokens(
  request: APIRequestContext,
  email: string,
): Promise<ApiTokens> {
  const res = await request.post('/api/auth/login', { data: { email, password: password() } });
  expect(res.status(), `login as ${email}`).toBe(200);
  return (await res.json()) as ApiTokens;
}

export interface Session {
  context: BrowserContext;
  /** The page, signed in through the real login form. Tokens live in its memory only. */
  page: Page;
  /** An API client signed in as the same user (its own session) for fast set-up and API assertions. */
  api: APIRequestContext;
}

/**
 * A fresh browser context signed in as `user`, optionally in another time zone. The page is signed
 * in through the UI (tokens are memory-only, so a full page load would sign it out: use `appGoto`
 * to move around, not `page.goto`).
 */
export async function newSession(
  browser: Browser,
  user: UserKey,
  options: { timezoneId?: string } = {},
): Promise<Session> {
  const context = await browser.newContext({
    ...(options.timezoneId && { timezoneId: options.timezoneId }),
  });
  const baseURL = apiOrigin();
  const anonymous = await request.newContext({ baseURL });
  const { accessToken } = await apiLoginTokens(anonymous, USERS[user]);
  await anonymous.dispose();
  const api = await request.newContext({
    baseURL,
    extraHTTPHeaders: { Authorization: `Bearer ${accessToken}` },
  });
  const page = await context.newPage();
  await uiSignIn(page, USERS[user]);
  return { context, page, api };
}

/**
 * Navigates inside the running single-page app WITHOUT a page load (history push + popstate, which
 * React Router listens to). A real `page.goto` reloads the document and, since the bearer tokens
 * are kept in memory only, would sign the user out.
 */
export async function appGoto(page: Page, path: string): Promise<void> {
  await page.evaluate((to) => {
    window.history.pushState({}, '', to);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}

/** Sign in through the real login form. */
export async function uiSignIn(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password());
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible();
}

export async function uiSignOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
}

export const nav = (page: Page, name: string, exact = false) =>
  page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name, exact });

/** Admin creates a project + one task through the API; returns the ids. */
export async function createProject(
  request: APIRequestContext,
  code: string,
  options: { budgetHours?: number } = {},
): Promise<{ projectId: string; taskId: string }> {
  const project = await request.post('/api/projects', {
    data: { code, name: `Project ${code}`, budgetHours: options.budgetHours ?? 100 },
  });
  expect(project.status()).toBe(201);
  const { project: p } = (await project.json()) as { project: { id: string } };
  const task = await request.post(`/api/projects/${p.id}/tasks`, { data: { name: 'Work' } });
  expect(task.status()).toBe(201);
  const { task: t } = (await task.json()) as { task: { id: string } };
  return { projectId: p.id, taskId: t.id };
}

export async function createEntry(
  request: APIRequestContext,
  data: {
    projectId: string;
    taskId: string;
    workDate: string;
    hours: number;
    isBillable?: boolean;
    notes?: string;
  },
): Promise<string> {
  const res = await request.post('/api/time-entries', { data: { isBillable: true, ...data } });
  expect(res.status(), await res.text()).toBe(201);
  return ((await res.json()) as { entry: { id: string } }).entry.id;
}

export const uniqueCode = (prefix: string) => `${prefix}-${Date.now().toString(36).toUpperCase()}`;
