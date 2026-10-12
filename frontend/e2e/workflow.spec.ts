import { expect, test } from '@playwright/test';
import { USERS, newSession, nav, uiSignIn, uiSignOut, uniqueCode } from './support/helpers';

/**
 * The core business workflow through the real UI, backend and database:
 * admin sets up a project → contributor logs and submits hours → manager rejects, contributor fixes
 * and resubmits → manager approves → reports and budget agree with what was logged.
 * Dates are explicit (week of Mon 5 Oct 2026) so the test never depends on today's date.
 */
test.describe.serial('timesheet workflow', () => {
  const code = uniqueCode('WF');
  const label = `${code} · Project ${code}`;

  test('anonymous visitors are sent to the login page, and a wrong password is explained', async ({
    page,
  }) => {
    await page.goto('/timesheet');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/login');

    await page.getByLabel('Email').fill(USERS.dev1);
    await page.getByLabel('Password').fill('definitely-wrong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Invalid email or password' }),
    ).toBeVisible();
  });

  test('admin creates a project and a task in the UI', async ({ page }) => {
    await uiSignIn(page, USERS.admin);
    await nav(page, 'Projects').click();
    await page.getByRole('button', { name: 'New project' }).click();
    const form = page.getByRole('form', { name: 'New project' });
    await form.getByLabel('Code').fill(code);
    await form.getByLabel('Name').fill(`Project ${code}`);
    await form.getByLabel('Budget (hours)').fill('10');
    await form.getByRole('button', { name: 'Create project' }).click();
    const card = page.getByRole('region', { name: new RegExp(code) });
    await expect(card).toBeVisible();

    await card
      .getByRole('form', { name: `Add task to ${code}` })
      .getByLabel('New task')
      .fill('Build');
    await card.getByRole('button', { name: 'Add task' }).click();
    await expect(card.getByText('Build', { exact: true })).toBeVisible();
    await uiSignOut(page);
  });

  test('contributor logs hours, hits the daily limit, and submits the week', async ({ page }) => {
    await uiSignIn(page, USERS.dev1);
    await page.goto('/timesheet?week=2026-10-05');
    await expect(page.getByText('h total')).toBeVisible();

    const add = async (
      dayLabel: string,
      hours: string,
      options: { billable?: boolean; notes?: string } = {},
    ) => {
      await page.getByRole('button', { name: `Add entry on ${dayLabel}` }).click();
      const form = page.getByRole('form', { name: 'Add time entry' });
      await form.getByLabel('Project').selectOption({ label });
      await form.getByLabel('Task').selectOption({ label: 'Build' });
      await form.getByLabel('Hours').fill(hours);
      if (options.notes) await form.getByLabel('Notes (optional)').fill(options.notes);
      if (options.billable === false) await form.getByLabel('Billable').uncheck();
      await form.getByRole('button', { name: 'Add entry' }).click();
      return form;
    };

    await add('Mon 5 Oct', '7.5', { notes: 'Kick-off' });
    await expect(
      page.getByRole('region', { name: 'Mon 5 Oct' }).getByText('Kick-off'),
    ).toBeVisible();
    await add('Tue 6 Oct', '2', { billable: false });
    await expect(
      page.getByRole('region', { name: 'Tue 6 Oct' }).getByText('Non-billable'),
    ).toBeVisible();
    await expect(page.getByText('9.5 h', { exact: true })).toBeVisible();

    // The backend's 24 h/day rule, surfaced by the real form (7.5 + 17 > 24).
    const rejected = await add('Mon 5 Oct', '17');
    await expect(
      page.getByRole('alert').filter({ hasText: 'exceeding the 24-hour daily limit' }),
    ).toBeVisible();
    await rejected.getByRole('button', { name: 'Cancel' }).click();

    await page.getByRole('button', { name: 'Submit week for approval' }).click();
    await page.getByRole('button', { name: 'Yes, submit' }).click();
    await expect(page.getByText(/Waiting for your manager/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Add entry on/ })).toHaveCount(0);
    await uiSignOut(page);
  });

  test('manager rejects with a reason; the contributor sees it, fixes and resubmits', async ({
    page,
  }) => {
    await uiSignIn(page, USERS.manager);
    await nav(page, 'Approvals').click();
    await page.getByRole('link', { name: /Review Casey Contributor/ }).click();
    await expect(page.getByText('Kick-off')).toBeVisible();
    await page.getByRole('button', { name: 'Reject' }).click(); // no reason yet
    await expect(page.getByText(/Explain what needs to change/)).toBeVisible();
    await page.getByLabel('Comment').fill('Please add Wednesday');
    await page.getByRole('button', { name: 'Reject' }).click();
    await expect(page.getByText(/Timesheet rejected\./)).toBeVisible();
    await uiSignOut(page);

    await uiSignIn(page, USERS.dev1);
    await page.goto('/timesheet?week=2026-10-05');
    await expect(page.getByText(/Please add Wednesday/)).toBeVisible();
    await page.getByRole('button', { name: 'Add entry on Wed 7 Oct' }).click();
    const form = page.getByRole('form', { name: 'Add time entry' });
    await form.getByLabel('Project').selectOption({ label });
    await form.getByLabel('Task').selectOption({ label: 'Build' });
    await form.getByLabel('Hours').fill('1');
    await form.getByRole('button', { name: 'Add entry' }).click();
    await expect(page.getByText('10.5 h', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Resubmit week for approval' }).click();
    await page.getByRole('button', { name: 'Yes, submit' }).click();
    await expect(page.getByText(/Waiting for your manager/)).toBeVisible();
    await uiSignOut(page);
  });

  test('manager approves, and the contributor sees the final status', async ({ page }) => {
    await uiSignIn(page, USERS.manager);
    await nav(page, 'Approvals').click();
    await page.getByRole('link', { name: /Review Casey Contributor/ }).click();
    await page.getByLabel('Comment').fill('Looks good');
    await page.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByText(/Timesheet approved\./)).toBeVisible();
    await expect(page.getByText('Already decided')).toBeVisible();
    const history = page.getByRole('region', { name: 'Decision history' });
    await expect(history.getByText('Rejected')).toBeVisible();
    await expect(history.getByText('Approved')).toBeVisible();
    await uiSignOut(page);

    await uiSignIn(page, USERS.dev1);
    await page.goto('/timesheet?week=2026-10-05');
    await expect(page.getByText('Approved', { exact: true }).first()).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Edit entry|Delete entry|Add entry on/ }),
    ).toHaveCount(0);
  });

  test('the report and the budget agree with what was logged (10.5 h: 8.5 billable, 2 non-billable)', async ({
    browser,
  }) => {
    const { page, context } = await newSession(browser, 'admin');
    await page.goto('/reports');
    await page.getByLabel('From').fill('2026-10-01');
    await page.getByLabel('To', { exact: true }).fill('2026-10-31');
    const filters = page.getByRole('form', { name: 'Report filters' });
    await filters.getByRole('checkbox', { name: 'Project' }).check();
    await filters
      .getByLabel('Project', { exact: true })
      .selectOption({ label: `${code} · Project ${code}` })
      .catch(() => undefined);
    await filters.getByRole('button', { name: 'Run report' }).click();
    const row = page.getByRole('row').filter({ hasText: code });
    await expect(row.getByRole('cell').nth(2)).toHaveText('10.5'); // total
    await expect(row.getByRole('cell').nth(3)).toHaveText('8.5'); // billable
    await expect(row.getByRole('cell').nth(4)).toHaveText('2'); // non-billable

    await nav(page, 'Budgets').click();
    const budget = page.getByRole('row').filter({ hasText: code });
    await expect(budget).toContainText('10.5');
    await expect(budget).toContainText('Over budget'); // 10.5 h against a 10 h budget
    await context.close();
  });
});
