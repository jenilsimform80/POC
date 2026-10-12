import { beforeAll, describe, expect, it } from 'vitest';
import { getCurrentUser, login, logout } from '../src/api/auth';
import { ApiError } from '../src/api/errors';
import { listLockedPeriods, lockPeriod, unlockPeriod } from '../src/api/periods';
import {
  createProject,
  createTask,
  listProjects,
  updateProject,
  updateTask,
} from '../src/api/projects';
import { getBudgetReport, getHoursReport } from '../src/api/reports';
import {
  approveSubmission,
  getSubmission,
  listSubmissions,
  rejectSubmission,
  submitWeek,
} from '../src/api/submissions';
import { createEntry, deleteEntry, getWeek, updateEntry } from '../src/api/timesheets';
import { getUser, listDirectReports, listUsers } from '../src/api/users';
import { getDatabaseHealth, getHealth } from '../src/api/health';
import { addDays, mondayOf, monthOf } from '../src/lib/dates';

/**
 * Drives the frontend's own typed API wrappers against a live backend, one cookie jar per role,
 * and checks the response shapes the UI relies on. Requires the demo users (backend `npm run
 * db:seed`) and LIVE_PASSWORD (the SEED_PASSWORD used). Run against a DISPOSABLE database.
 */
const PASSWORD = process.env['LIVE_PASSWORD'] ?? '';
const jars = new Map<string, Map<string, string>>();
let currentJar = 'anonymous';

const realFetch = globalThis.fetch;
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const jar = jars.get(currentJar) ?? new Map<string, string>();
  jars.set(currentJar, jar);
  const headers = new Headers(init?.headers);
  if (jar.size > 0) headers.set('Cookie', [...jar].map(([k, v]) => `${k}=${v}`).join('; '));
  const response = await realFetch(input, { ...init, headers });
  for (const line of response.headers.getSetCookie()) {
    const [pair = ''] = line.split(';');
    const [name = '', ...rest] = pair.split('=');
    const value = rest.join('=');
    if (value === '') jar.delete(name.trim());
    else jar.set(name.trim(), value);
  }
  return response;
};
const as = async <T>(role: string, fn: () => Promise<T>): Promise<T> => {
  currentJar = role;
  return fn();
};
const caught = async (p: Promise<unknown>) =>
  p.then(
    () => undefined,
    (e: unknown) => e,
  );

// A unique, far-future Monday per run so reruns never collide with earlier data.
const weekStart = mondayOf(addDays('2040-01-01', 7 * (Math.floor(Date.now() / 604_800_000) % 900)));
const day = (n: number) => addDays(weekStart, n);
const code = `LIVE-${Date.now()}`;

const ids: Record<string, string> = {};

describe.skipIf(!PASSWORD)('frontend API wrappers against the real backend', () => {
  beforeAll(() => {
    expect(PASSWORD.length).toBeGreaterThan(11);
  });

  it('health endpoints', async () => {
    const health = await as('anonymous', () => getHealth());
    expect(health.status).toBe('ok');
    expect(typeof health.uptimeSeconds).toBe('number');
    await expect(as('anonymous', () => getDatabaseHealth())).resolves.toEqual({
      status: 'ok',
      database: 'up',
    });
  });

  it('sessions: anonymous → login → me → wrong password → role users', async () => {
    await expect(as('anonymous', () => getCurrentUser())).resolves.toBeNull();
    const bad = await caught(as('anonymous', () => login('dev1@example.com', 'wrong-password-1')));
    expect(bad).toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });

    const dev = await as('dev', () => login('dev1@example.com', PASSWORD));
    const mgr = await as('mgr', () => login('manager@example.com', PASSWORD));
    const admin = await as('admin', () => login('admin@example.com', PASSWORD));
    expect(dev).toMatchObject({ role: 'CONTRIBUTOR', email: 'dev1@example.com' });
    expect(mgr.role).toBe('MANAGER');
    expect(admin.role).toBe('ADMIN');
    expect(Object.keys(dev).sort()).toEqual(['email', 'id', 'managerId', 'name', 'role']); // no secrets
    Object.assign(ids, { dev: dev.id, mgr: mgr.id, admin: admin.id });
    await expect(as('dev', () => getCurrentUser())).resolves.toMatchObject({ id: dev.id });
  });

  it('projects and tasks: admin manages, everyone reads, non-admin write is refused', async () => {
    const created = await as('admin', () =>
      createProject({ code, name: 'Live check', budgetHours: 10, clientName: 'Acme' }),
    );
    expect(created).toMatchObject({ code, budgetHours: 10, isActive: true, clientName: 'Acme' });
    const task = await as('admin', () => createTask(created.id, 'Work'));
    const archivedTask = await as('admin', () => createTask(created.id, 'Old'));
    await as('admin', () => updateTask(created.id, archivedTask.id, { isActive: false }));
    Object.assign(ids, { project: created.id, task: task.id });

    const visible = await as('dev', () => listProjects());
    const mine = visible.find((p) => p.id === created.id);
    expect(mine?.tasks?.map((t) => t.name)).toEqual(['Work']); // archived task hidden
    expect(
      await caught(
        as('dev', () => createProject({ code: `${code}-X`, name: 'x', budgetHours: 1 })),
      ),
    ).toMatchObject({ status: 403, code: 'FORBIDDEN' });
    expect(await caught(as('dev', () => listProjects({ includeArchived: true })))).toMatchObject({
      status: 403,
    });
    expect(
      await caught(as('admin', () => createProject({ code, name: 'dup', budgetHours: 1 }))),
    ).toMatchObject({ status: 409, code: 'CONFLICT' });
    const patched = await as('admin', () => updateProject(created.id, { clientName: null }));
    expect(patched.clientName).toBeNull();
  });

  it('timesheet: entries, week summary, warnings shape, validation errors', async () => {
    const result = await as('dev', () =>
      createEntry({
        projectId: ids['project']!,
        taskId: ids['task']!,
        workDate: day(0),
        hours: 8,
        isBillable: true,
        notes: 'live',
      }),
    );
    expect(result.entry).toMatchObject({
      workDate: day(0),
      hours: 8,
      isBillable: true,
      userId: ids['dev'],
    });
    expect(result.warnings).toEqual([]);
    ids['entry'] = result.entry.id;

    const updated = await as('dev', () => updateEntry(ids['entry']!, { hours: 11 }));
    expect(updated.warnings[0]).toMatchObject({ code: 'DAILY_HOURS_HIGH', threshold: 10 });
    await as('dev', () => updateEntry(ids['entry']!, { hours: 8 }));
    const second = await as('dev', () =>
      createEntry({
        projectId: ids['project']!,
        taskId: ids['task']!,
        workDate: day(1),
        hours: 2.5,
        isBillable: false,
      }),
    );

    const week = await as('dev', () => getWeek(weekStart));
    expect(week).toMatchObject({
      weekStart,
      weekEnd: day(6),
      status: 'DRAFT',
      weeklyTotal: 10.5,
      billableTotal: 8,
      nonBillableTotal: 2.5,
      submission: null,
    });
    expect(week.dailyTotals).toEqual({ [day(0)]: 8, [day(1)]: 2.5 });
    expect(week.entries).toHaveLength(2);
    expect(Array.isArray(week.warnings)).toBe(true);

    const invalid = await caught(
      as('dev', () =>
        createEntry({
          projectId: ids['project']!,
          taskId: ids['task']!,
          workDate: day(2),
          hours: 25,
          isBillable: true,
        }),
      ),
    );
    expect(invalid).toBeInstanceOf(ApiError);
    expect(invalid).toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    expect(Array.isArray((invalid as ApiError).details)).toBe(true);
    await as('dev', () => deleteEntry(second.entry.id));
  });

  it('submission → manager review → reject → fix → resubmit → approve', async () => {
    const submission = await as('dev', () => submitWeek(weekStart));
    expect(submission).toMatchObject({ status: 'SUBMITTED', weekStart, userId: ids['dev'] });
    ids['submission'] = submission.id;

    const frozen = await caught(
      as('dev', () =>
        createEntry({
          projectId: ids['project']!,
          taskId: ids['task']!,
          workDate: day(3),
          hours: 1,
          isBillable: true,
        }),
      ),
    );
    expect(frozen).toMatchObject({ status: 409, code: 'WEEK_NOT_EDITABLE' });

    const reports = await as('mgr', () => listDirectReports());
    expect(reports.map((u) => u.email)).toContain('dev1@example.com');
    const queue = await as('mgr', () =>
      listSubmissions({ forApproval: true, status: 'SUBMITTED' }),
    );
    expect(queue.map((s) => s.id)).toContain(submission.id);
    const owner = await as('mgr', () => getUser(ids['dev']!));
    expect(owner.name).toBeTruthy();
    const reviewWeek = await as('mgr', () => getWeek(weekStart, ids['dev']));
    expect(reviewWeek.status).toBe('SUBMITTED');
    expect(reviewWeek.entries).toHaveLength(1);

    expect(await caught(as('admin', () => approveSubmission(submission.id)))).toMatchObject({
      status: 403,
    }); // admins don't approve
    expect(await caught(as('dev', () => approveSubmission(submission.id)))).toMatchObject({
      status: 403,
    });

    const rejected = await as('mgr', () => rejectSubmission(submission.id, 'Please add notes'));
    expect(rejected.status).toBe('REJECTED');
    const detail = await as('dev', () => getSubmission(submission.id));
    expect(detail.approvals?.at(-1)).toMatchObject({
      decision: 'REJECTED',
      comment: 'Please add notes',
    });
    expect((await as('dev', () => getWeek(weekStart))).status).toBe('REJECTED');

    await as('dev', () => updateEntry(ids['entry']!, { notes: 'notes added' }));
    await as('dev', () => submitWeek(weekStart));
    const approved = await as('mgr', () => approveSubmission(submission.id, 'Thanks'));
    expect(approved.status).toBe('APPROVED');
    expect(approved.approvals?.map((a) => a.decision)).toEqual(['REJECTED', 'APPROVED']);
    expect(
      (await as('dev', () => listSubmissions())).some(
        (s) => s.id === submission.id && s.status === 'APPROVED',
      ),
    ).toBe(true);
    const again = await caught(as('mgr', () => rejectSubmission(submission.id, 'too late')));
    expect(again).toMatchObject({ status: 409, code: 'INVALID_STATE' });
  });

  it('period locking: lock, writes refused with PERIOD_LOCKED, unlock with a reason', async () => {
    const period = monthOf(day(3));
    expect(await caught(as('dev', () => lockPeriod(period)))).toMatchObject({ status: 403 });
    const locked = await as('admin', () => lockPeriod(period, 'live check'));
    expect(locked).toMatchObject({ period, note: 'live check', lockedBy: { id: ids['admin'] } });
    expect((await as('dev', () => listLockedPeriods())).map((p) => p.period)).toContain(period);

    const refused = await caught(
      as('dev', () =>
        createEntry({
          projectId: ids['project']!,
          taskId: ids['task']!,
          workDate: day(3),
          hours: 1,
          isBillable: true,
        }),
      ),
    );
    expect(refused).toMatchObject({ status: 409, code: 'PERIOD_LOCKED' });
    expect((refused as ApiError).details).toMatchObject({ period });
    expect(await caught(as('admin', () => lockPeriod(period)))).toMatchObject({
      status: 409,
      code: 'CONFLICT',
    });

    expect(await caught(as('admin', () => unlockPeriod(period, 'x')))).toMatchObject({
      status: 400,
    }); // reason too short
    await as('admin', () => unlockPeriod(period, 'live check cleanup'));
    expect((await as('dev', () => listLockedPeriods())).map((p) => p.period)).not.toContain(period);
  });

  it('reports: shapes, role scoping, budget admin-only', async () => {
    const range = { from: weekStart, to: day(6) };
    const byMonth = await as('dev', () => getHoursReport({ ...range, groupBy: ['month'] }));
    expect(byMonth.rows[0]).toMatchObject({
      month: monthOf(weekStart),
      totalHours: 8,
      billableHours: 8,
      nonBillableHours: 0,
      entryCount: 1,
    });
    expect(byMonth).toMatchObject({ truncated: false, totals: { totalHours: 8, entryCount: 1 } });

    const full = await as('admin', () =>
      getHoursReport({ ...range, groupBy: ['contributor', 'project', 'month'] }),
    );
    const row = full.rows.find((r) => r.projectCode === code);
    expect(row).toMatchObject({
      userName: expect.any(String) as string,
      projectName: 'Live check',
      totalHours: 8,
    });

    const mgrView = await as('mgr', () => getHoursReport({ ...range, groupBy: ['contributor'] }));
    expect(mgrView.totals.totalHours).toBeGreaterThanOrEqual(8); // sees their direct report
    const people = await as('mgr', () => listUsers());
    expect(people.map((u) => u.email)).toContain('dev1@example.com');
    expect(
      await caught(
        as('dev', () => getHoursReport({ ...range, groupBy: ['month'], userId: ids['mgr']! })),
      ),
    ).toMatchObject({ status: 404 });

    const budget = await as('admin', () => getBudgetReport());
    const mine = budget.projects.find((p) => p.projectId === ids['project']);
    expect(mine).toMatchObject({
      budgetHours: 10,
      loggedHours: 8,
      billableHours: 8,
      remainingHours: 2,
      percentUsed: 80,
      status: 'WARNING',
    });
    expect(budget.totals.budgetHours).toBeGreaterThanOrEqual(10);
    expect(await caught(as('mgr', () => getBudgetReport()))).toMatchObject({ status: 403 });
    expect(await caught(as('dev', () => getBudgetReport()))).toMatchObject({ status: 403 });
  });

  it('logout ends the session on the server', async () => {
    await as('dev', () => logout());
    await expect(as('dev', () => getCurrentUser())).resolves.toBeNull();
    await as('mgr', () => logout());
    await as('admin', () => logout());
  });
});
