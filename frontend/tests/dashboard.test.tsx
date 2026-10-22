import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mondayOf, todayIso } from '../src/lib/dates';
import { dashboardApi, entry, mockApi, ok, renderRoutes, signedInAs, users, week } from './helpers';

const monday = () => mondayOf(todayIso());
const thisMonth = () => todayIso().slice(0, 7);

const hours = (rows: object[], totals = { totalHours: 12, billableHours: 9 }) =>
  ok({
    from: '',
    to: '',
    groupBy: [],
    rows,
    totals: {
      ...totals,
      nonBillableHours: totals.totalHours - totals.billableHours,
      entryCount: 3,
    },
    truncated: false,
  });

describe('home dashboard', () => {
  it('shows a contributor their week, billable share and project hours — and no team panels', async () => {
    const weekData = week({
      weekStart: monday(),
      status: 'SUBMITTED',
      entries: [
        entry({ workDate: monday(), hours: 8 }),
        entry({ id: 'e2', workDate: monday(), hours: 4, isBillable: false }),
      ],
    });
    mockApi({
      ...signedInAs(users.contributor),
      ...dashboardApi(),
      'GET /timesheets/:weekStart': ok(weekData),
      'GET /reports/hours': (req) =>
        req.query.get('groupBy') === 'project'
          ? hours([
              {
                projectId: 'p1',
                projectCode: 'ALPHA',
                projectName: 'Alpha Platform',
                totalHours: 12,
                billableHours: 8,
                nonBillableHours: 4,
                entryCount: 2,
              },
            ])
          : hours([
              {
                month: thisMonth(),
                totalHours: 12,
                billableHours: 8,
                nonBillableHours: 4,
                entryCount: 2,
              },
            ]),
    });

    renderRoutes('/');

    expect(
      await screen.findByRole('img', { name: /Hours per day this week: Mon 12/ }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: /Hours per month/ })).toBeInTheDocument();
    const project = await screen.findByRole('list', { name: 'Hours by project this month' });
    expect(within(project).getByText('ALPHA')).toBeInTheDocument();
    expect(screen.getByText('75')).toBeInTheDocument(); // 9 / 12 billable (report totals)
    expect(screen.queryByText('Hours by person')).not.toBeInTheDocument();
    expect(screen.queryByText('Budget health')).not.toBeInTheDocument();
    expect(screen.queryByText('Waiting for your decision')).not.toBeInTheDocument();
  });

  it('shows a manager the team breakdown and the pending approvals with a review link', async () => {
    mockApi({
      ...signedInAs(users.manager),
      ...dashboardApi(),
      'GET /submissions': ok({
        submissions: [
          {
            id: 's1',
            userId: 'u-dev',
            weekStart: '2026-03-02',
            status: 'SUBMITTED',
            submittedAt: '',
            updatedAt: '',
          },
        ],
      }),
      'GET /users': ok({ users: [users.contributor] }),
    });

    renderRoutes('/');

    expect(await screen.findByRole('heading', { name: 'Hours by person' })).toBeInTheDocument();
    const review = await screen.findByRole('link', { name: 'Review' });
    expect(review).toHaveAttribute('href', '/approvals/s1');
    expect(screen.getAllByText('Casey Contributor').length).toBeGreaterThan(0);
  });

  it('shows an admin the budget health with over-budget projects flagged', async () => {
    mockApi({
      ...signedInAs(users.admin),
      ...dashboardApi(),
      'GET /reports/project-budgets': ok({
        through: null,
        totals: { budgetHours: 100, loggedHours: 120 },
        projects: [
          {
            projectId: 'p1',
            code: 'ALPHA',
            name: 'Alpha Platform',
            isActive: true,
            budgetHours: 100,
            loggedHours: 120,
            billableHours: 100,
            nonBillableHours: 20,
            remainingHours: -20,
            percentUsed: 120,
            status: 'OVER',
          },
        ],
      }),
    });

    renderRoutes('/');

    expect(await screen.findByRole('heading', { name: 'Budget health' })).toBeInTheDocument();
    expect(await screen.findByRole('progressbar', { name: 'ALPHA budget used' })).toHaveAttribute(
      'aria-valuenow',
      '100',
    );
    expect(screen.getByText(/120 \/ 100 h \(120%\)/)).toBeInTheDocument();
  });

  it('keeps the rest of the dashboard when one panel fails', async () => {
    mockApi({
      ...signedInAs(users.contributor),
      ...dashboardApi(),
      'GET /reports/hours': (req) =>
        req.query.get('groupBy') === 'project'
          ? new Response(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'x' } }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            })
          : hours([]),
    });

    renderRoutes('/');

    expect(await screen.findByText('Could not load project hours')).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: /Hours per day this week/ })).toBeInTheDocument();
  });

  it('shows an admin the approvals waiting because someone has no manager', async () => {
    mockApi({
      ...signedInAs(users.admin),
      ...dashboardApi(),
      'GET /submissions': ok({
        submissions: [
          {
            id: 's9',
            userId: 'u-dev',
            weekStart: '2026-03-02',
            status: 'SUBMITTED',
            submittedAt: '',
            updatedAt: '',
          },
        ],
      }),
      'GET /users': ok({ users: [users.contributor] }),
    });

    renderRoutes('/');

    expect(await screen.findByRole('link', { name: 'Review' })).toHaveAttribute(
      'href',
      '/approvals/s9',
    );
  });
});
