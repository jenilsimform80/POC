import {
  expect,
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

/** Sign in through the API (fast); the session cookie lands in the browser context. */
export async function apiLogin(request: APIRequestContext, email: string): Promise<void> {
  const res = await request.post('/api/auth/login', { data: { email, password: password() } });
  expect(res.status(), `login as ${email}`).toBe(200);
}

export interface Session {
  context: BrowserContext;
  page: Page;
}

/** A fresh browser context signed in as `user`, optionally in another time zone. */
export async function newSession(
  browser: Browser,
  user: UserKey,
  options: { timezoneId?: string } = {},
): Promise<Session> {
  const context = await browser.newContext({
    ...(options.timezoneId && { timezoneId: options.timezoneId }),
  });
  await apiLogin(context.request, USERS[user]);
  return { context, page: await context.newPage() };
}

/** Sign in through the real login form. */
export async function uiSignIn(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password());
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
}

export async function uiSignOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Sign out' }).click();
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
