import { expect, test } from '@playwright/test';
import { appGoto, createEntry, createProject, newSession, uniqueCode } from './support/helpers';

/**
 * Period locking, proven through the real UI AND by calling the API directly with the contributor's
 * own browser session (the UI is not the security boundary). May 2027 is locked; June stays open.
 */
test.describe.serial('period locking', () => {
  const code = uniqueCode('LK');
  const ids = { projectId: '', taskId: '', mayEntry: '', juneEntry: '' };

  test('setup: a project and two entries (one in May, one in June)', async ({ browser }) => {
    const admin = await newSession(browser, 'admin');
    Object.assign(ids, await createProject(admin.api, code));
    await admin.context.close();

    const dev = await newSession(browser, 'dev1');
    const base = { projectId: ids.projectId, taskId: ids.taskId, hours: 4 };
    ids.mayEntry = await createEntry(dev.api, { ...base, workDate: '2027-05-04' });
    ids.juneEntry = await createEntry(dev.api, { ...base, workDate: '2027-06-01' });
    await dev.context.close();
  });

  test('admin locks May 2027 in the UI; the contributor sees it locked', async ({ browser }) => {
    const admin = await newSession(browser, 'admin');
    await appGoto(admin.page, '/periods');
    const form = admin.page.getByRole('form', { name: 'Lock a month' });
    await form.getByLabel('Month').fill('2027-05');
    await form.getByLabel('Note (optional)').fill('May billed');
    await form.getByRole('button', { name: 'Lock month' }).click();
    await expect(admin.page.getByRole('cell', { name: 'May 2027', exact: true })).toBeVisible();
    await admin.context.close();

    const dev = await newSession(browser, 'dev1');
    await appGoto(dev.page, '/timesheet?week=2027-05-03');
    await expect(dev.page.getByText('This month is locked for billing.').first()).toBeVisible();
    await expect(
      dev.page.getByRole('button', { name: /Add entry on|^Edit entry|^Delete entry/ }),
    ).toHaveCount(0);
    await appGoto(dev.page, '/timesheet?week=2027-05-31'); // week spanning May/June: June days stay editable
    await expect(dev.page.getByRole('button', { name: 'Add entry on Tue 1 Jun' })).toBeVisible();
    await expect(dev.page.getByRole('button', { name: 'Add entry on Mon 31 May' })).toHaveCount(0);
    await dev.context.close();
  });

  test('direct API writes in the locked month are refused by the backend (service layer)', async ({
    browser,
  }) => {
    const dev = await newSession(browser, 'dev1');
    const api = dev.api;
    const refuse = async (res: Awaited<ReturnType<typeof api.post>>) => {
      expect(res.status()).toBe(409);
      const body = (await res.json()) as {
        error: { code: string; details: { period: string; enforcedBy: string } };
      };
      expect(body.error.code).toBe('PERIOD_LOCKED');
      expect(body.error.details).toMatchObject({ period: '2027-05', enforcedBy: 'service' });
    };

    await refuse(
      await api.post('/api/time-entries', {
        data: {
          projectId: ids.projectId,
          taskId: ids.taskId,
          workDate: '2027-05-05',
          hours: 1,
          isBillable: true,
        },
      }),
    );
    await refuse(await api.patch(`/api/time-entries/${ids.mayEntry}`, { data: { hours: 1 } }));
    await refuse(
      await api.patch(`/api/time-entries/${ids.mayEntry}`, { data: { notes: 'sneaky' } }),
    );
    await refuse(await api.delete(`/api/time-entries/${ids.mayEntry}`));
    await refuse(
      await api.patch(`/api/time-entries/${ids.juneEntry}`, { data: { workDate: '2027-05-05' } }),
    ); // move INTO the locked month
    await refuse(
      await api.patch(`/api/time-entries/${ids.mayEntry}`, { data: { workDate: '2027-06-02' } }),
    ); // move OUT of it

    const may = await api.get(`/api/time-entries/${ids.mayEntry}`);
    expect(
      ((await may.json()) as { entry: { hours: number; workDate: string } }).entry,
    ).toMatchObject({ hours: 4, workDate: '2027-05-04' });
    expect(
      (await api.patch(`/api/time-entries/${ids.juneEntry}`, { data: { hours: 5 } })).status(),
    ).toBe(200); // June is still open
    await dev.context.close();
  });

  test('admins are not exempt from the lock', async ({ browser }) => {
    const admin = await newSession(browser, 'admin');

    const res = await admin.api.post('/api/time-entries', {
      data: {
        projectId: ids.projectId,
        taskId: ids.taskId,
        workDate: '2027-05-06',
        hours: 1,
        isBillable: true,
      },
    });

    expect(res.status()).toBe(409);
    await admin.context.close();
  });

  test('unlocking needs a reason, reopens the month, and both actions are in the audit trail', async ({
    browser,
  }) => {
    const admin = await newSession(browser, 'admin');
    await appGoto(admin.page, '/periods');
    await admin.page.getByRole('button', { name: 'Unlock May 2027' }).click();
    const form = admin.page.getByRole('form', { name: 'Unlock May 2027' });
    await form.getByLabel('Reason').fill('ab');
    await form.getByRole('button', { name: 'Unlock month' }).click();
    await expect(form.getByText(/Give a reason/)).toBeVisible();
    await form.getByLabel('Reason').fill('Late invoice correction');
    await form.getByRole('button', { name: 'Unlock month' }).click();
    await expect(admin.page.getByRole('cell', { name: 'May 2027', exact: true })).toHaveCount(0);

    const dev = await newSession(browser, 'dev1');
    expect(
      (await dev.api.patch(`/api/time-entries/${ids.mayEntry}`, { data: { hours: 3 } })).status(),
    ).toBe(200);
    await dev.context.close();

    const audit = await admin.api.get('/api/audit-logs?entityType=locked_period');
    const logs = (
      (await audit.json()) as {
        auditLogs: {
          action: string;
          metadata: { period: string; reason?: string; note?: string };
        }[];
      }
    ).auditLogs;
    const may = logs
      .filter((l) => l.metadata.period === '2027-05')
      .map((l) => l.action)
      .reverse();
    expect(may).toEqual(['PERIOD_LOCKED', 'PERIOD_UNLOCKED']);
    expect(logs.find((l) => l.action === 'PERIOD_UNLOCKED')?.metadata.reason).toBe(
      'Late invoice correction',
    );
    await admin.context.close();
  });
});
