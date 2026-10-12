import { expect, test } from '@playwright/test';
import { createEntry, createProject, newSession, uniqueCode } from './support/helpers';

/**
 * Calendar dates must never move with the viewer's time zone (ADR 0006). Entries sit on the
 * 31 Aug / 1 Sep 2027 month boundary; the same data is read from browsers set to +14:00, -07:00 and
 * UTC. The week view, the report and the API must all agree, in every zone.
 */
test.describe('time zones and report accuracy', () => {
  const code = uniqueCode('TZ');
  const ids = { projectId: '', taskId: '' };

  test.beforeAll(async ({ browser }) => {
    const admin = await newSession(browser, 'admin');
    Object.assign(ids, await createProject(admin.context.request, code, { budgetHours: 20 }));
    await admin.context.close();
    const dev = await newSession(browser, 'dev1');
    // Mon 30 Aug 2027 is the week start. Tue 31 Aug (3 h billable) and Wed 1 Sep (5 h, 2 of which are a separate non-billable entry).
    await createEntry(dev.context.request, { ...ids, workDate: '2027-08-31', hours: 3 });
    await createEntry(dev.context.request, { ...ids, workDate: '2027-09-01', hours: 3 });
    await createEntry(dev.context.request, {
      ...ids,
      workDate: '2027-09-01',
      hours: 2,
      isBillable: false,
    });
    await dev.context.close();
  });

  for (const timezoneId of [
    'UTC',
    'Pacific/Kiritimati',
    'America/Los_Angeles',
    'Pacific/Pago_Pago',
  ]) {
    test(`week view, report and API agree in ${timezoneId}`, async ({ browser }) => {
      const { context, page } = await newSession(browser, 'dev1', { timezoneId });
      expect(await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)).toBe(
        timezoneId,
      );

      // Week view: the same days carry the same hours whatever the viewer's zone.
      await page.goto('/timesheet?week=2027-08-30');
      await expect(page.getByText('30 Aug – 5 Sep 2027')).toBeVisible();
      await expect(
        page.getByRole('region', { name: 'Tue 31 Aug' }).getByText('3 h').first(),
      ).toBeVisible();
      const wed = page.getByRole('region', { name: 'Wed 1 Sep' });
      await expect(wed.getByText('5 h').first()).toBeVisible(); // day total
      await expect(page.getByText('11 h', { exact: true })).toHaveCount(0);
      await expect(page.getByText('8 h', { exact: true }).first()).toBeVisible(); // week total

      // Report by month through the UI form.
      await page.goto('/reports');
      await page.getByLabel('From').fill('2027-08-01');
      await page.getByLabel('To', { exact: true }).fill('2027-09-30');
      await page.getByRole('button', { name: 'Run report' }).click();
      const august = page.getByRole('row').filter({ hasText: 'August 2027' });
      const september = page.getByRole('row').filter({ hasText: 'September 2027' });
      await expect(august.getByRole('cell').nth(1)).toHaveText('3');
      await expect(september.getByRole('cell').nth(1)).toHaveText('5');
      await expect(september.getByRole('cell').nth(2)).toHaveText('3'); // billable
      await expect(september.getByRole('cell').nth(3)).toHaveText('2'); // non-billable

      // The API the page used gives identical numbers, and so does the week summary.
      const report = await context.request.get(
        '/api/reports/hours?from=2027-08-01&to=2027-09-30&groupBy=month',
      );
      expect(
        ((await report.json()) as { rows: { month: string; totalHours: number }[] }).rows.map(
          (r) => [r.month, r.totalHours],
        ),
      ).toEqual([
        ['2027-08', 3],
        ['2027-09', 5],
      ]);
      const week = (await (await context.request.get('/api/timesheets/2027-08-30')).json()) as {
        weeklyTotal: number;
        dailyTotals: Record<string, number>;
      };
      expect(week.weeklyTotal).toBe(8);
      expect(week.dailyTotals).toEqual({ '2027-08-31': 3, '2027-09-01': 5 });
      await context.close();
    });
  }

  test('the budget report matches the logged hours (8 h of 20 h = 40 %)', async ({ browser }) => {
    const { context, page } = await newSession(browser, 'admin', {
      timezoneId: 'Pacific/Kiritimati',
    });

    await page.goto('/reports/budgets');

    const row = page.getByRole('row').filter({ hasText: code });
    await expect(row).toContainText('40%');
    await expect(row).toContainText('On track');
    await expect(row.getByRole('cell').nth(1)).toHaveText('8'); // logged
    await context.close();
  });

  test('reports agree with themselves: per-contributor, per-project and per-month totals are the same 8 h', async ({
    browser,
  }) => {
    const { context } = await newSession(browser, 'admin');
    const total = async (groupBy: string) => {
      const res = await context.request.get(
        `/api/reports/hours?from=2027-08-01&to=2027-09-30&groupBy=${groupBy}`,
      );
      const body = (await res.json()) as {
        rows: { projectCode?: string; totalHours: number }[];
        totals: { totalHours: number };
      };
      const mine = body.rows.filter((r) => groupBy !== 'project' || r.projectCode === code);
      return {
        rowsTotal: mine.reduce((s, r) => s + r.totalHours, 0),
        reported: body.totals.totalHours,
      };
    };

    const byProject = await total('project');
    const byMonth = await total('month');
    const all = await total('contributor,project,month');

    expect(byProject.rowsTotal).toBe(8);
    expect(byMonth.reported).toBe(8);
    expect(all.reported).toBe(8);
    await context.close();
  });
});
