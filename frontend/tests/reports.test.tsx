import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { HoursReport, User } from '../src/api/types';
import { todayIso } from '../src/lib/dates';
import {
  fail,
  mockApi,
  ok,
  project,
  renderRoutes,
  signedInAs,
  users,
  type MockRequest,
} from './helpers';

const today = todayIso();
const monthStart = `${today.slice(0, 7)}-01`;

const monthReport: HoursReport = {
  from: monthStart,
  to: today,
  groupBy: ['month'],
  rows: [
    { month: '2026-02', totalHours: 4, billableHours: 4, nonBillableHours: 0, entryCount: 1 },
    {
      month: '2026-03',
      totalHours: 31.75,
      billableHours: 20.5,
      nonBillableHours: 11.25,
      entryCount: 7,
    },
  ],
  totals: { totalHours: 35.75, billableHours: 24.5, nonBillableHours: 11.25, entryCount: 8 },
  truncated: false,
};

const team: User[] = [users.manager, users.contributor];
function reportsBackend(
  user: User,
  reportFor: (req: MockRequest) => HoursReport = () => monthReport,
  extra = {},
) {
  return mockApi({
    ...signedInAs(user),
    'GET /projects': ok({
      projects: [
        project(),
        project({ id: 'p2', code: 'BETA', name: 'Beta Portal', isActive: false }),
      ],
    }),
    'GET /users': ok({ users: team }),
    'GET /reports/hours': (req: MockRequest) => ok(reportFor(req)),
    ...extra,
  });
}
const open = async (
  user: User = users.admin,
  reportFor?: (req: MockRequest) => HoursReport,
  extra = {},
) => {
  const api = reportsBackend(user, reportFor, extra);
  renderRoutes('/reports');
  await screen.findByRole('heading', { name: 'Hours report' });
  return api;
};
const filters = () => within(screen.getByRole('form', { name: 'Report filters' }));
const results = () => within(screen.getByRole('region', { name: 'Report results' }));
const lastQuery = (api: ReturnType<typeof mockApi>) =>
  api.calls('GET /reports/hours').at(-1)!.query;

describe('hours report: running and reading', () => {
  it('runs with sensible defaults (this month, by month) and shows rows with totals', async () => {
    const api = await open();

    expect(await results().findByText('March 2026')).toBeInTheDocument();
    const query = lastQuery(api);
    expect(query.get('from')).toBe(monthStart);
    expect(query.get('to')).toBe(today);
    expect(query.get('groupBy')).toBe('month');
    const rows = results().getAllByRole('row');
    expect(
      within(rows[2]!)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['March 2026', '31.75', '20.5', '11.25', '7']);
    const total = rows.at(-1)!;
    expect(
      within(total)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['Total', '35.75', '24.5', '11.25', '8']);
  });

  it('sends the chosen filters, grouping always ordered contributor → project → month', async () => {
    const api = await open(users.admin, () => ({
      ...monthReport,
      groupBy: ['contributor', 'project'],
      rows: [
        {
          userName: 'Casey Contributor',
          projectCode: 'ALPHA',
          projectName: 'Alpha Platform',
          totalHours: 8,
          billableHours: 8,
          nonBillableHours: 0,
          entryCount: 1,
        },
      ],
      totals: { totalHours: 8, billableHours: 8, nonBillableHours: 0, entryCount: 1 },
    }));
    await userEvent.click(filters().getByLabelText('Month')); // untick the default
    await userEvent.click(filters().getByLabelText('Project', { selector: 'input' })); // clicked first…
    await userEvent.click(filters().getByLabelText('Contributor')); // …then contributor
    fireEvent.change(filters().getByLabelText('From'), { target: { value: '2026-01-01' } });
    fireEvent.change(filters().getByLabelText('To'), { target: { value: '2026-03-31' } });
    await userEvent.selectOptions(filters().getByLabelText('Person'), 'u-dev');
    await userEvent.selectOptions(
      filters().getByLabelText('Project', { selector: 'select' }),
      'p1',
    );

    await userEvent.click(filters().getByRole('button', { name: 'Run report' }));

    await waitFor(() => expect(lastQuery(api).get('groupBy')).toBe('contributor,project'));
    const query = lastQuery(api);
    expect(query.get('from')).toBe('2026-01-01');
    expect(query.get('to')).toBe('2026-03-31');
    expect(query.get('userId')).toBe('u-dev');
    expect(query.get('projectId')).toBe('p1');
    const headers = (await results().findAllByRole('columnheader')).map((h) => h.textContent);
    expect(headers).toEqual([
      'Contributor',
      'Project',
      'Total h',
      'Billable h',
      'Non-billable h',
      'Entries',
    ]);
    expect(results().getByText('ALPHA · Alpha Platform')).toBeInTheDocument();
    expect(results().getByText('Casey Contributor')).toBeInTheDocument();
  });

  it('shows an empty state when the range has no hours', async () => {
    await open(users.admin, () => ({
      ...monthReport,
      rows: [],
      totals: { totalHours: 0, billableHours: 0, nonBillableHours: 0, entryCount: 0 },
    }));

    expect(await screen.findByText('No hours in this range')).toBeInTheDocument();
  });

  it('warns when the backend truncated the result', async () => {
    await open(users.admin, () => ({ ...monthReport, truncated: true }));

    expect(await screen.findByText('Showing the first 5000 rows')).toBeInTheDocument();
  });

  it('shows a retryable error', async () => {
    let failing = true;
    await open(users.admin, undefined, {
      'GET /reports/hours': () =>
        failing ? fail(500, 'INTERNAL_ERROR', 'An unexpected error occurred') : ok(monthReport),
    });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not run the report');
    failing = false;
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));

    expect(await results().findByText('March 2026')).toBeInTheDocument();
  });

  it('shows the backend message for a rejected query', async () => {
    await open(users.admin, undefined, {
      'GET /reports/hours': fail(400, 'VALIDATION_ERROR', 'Request validation failed'),
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Request validation failed');
  });
});

describe('hours report: who sees which filters', () => {
  it('gives a contributor no person filter, and does not load the user list', async () => {
    const api = await open(users.contributor);

    expect(filters().queryByLabelText('Person')).not.toBeInTheDocument();
    expect(screen.getByText('Your logged hours.')).toBeInTheDocument();
    await waitFor(() => expect(api.calls('GET /projects')).toHaveLength(1));
    expect(api.calls('GET /users')).toHaveLength(0);
    expect(api.calls('GET /projects')[0]?.query.get('includeArchived')).toBeNull();
  });

  it('gives a manager a person filter filled from the users they may see', async () => {
    await open(users.manager);

    expect(screen.getByText(/direct reports/)).toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(filters().getByLabelText('Person'))
          .getAllByRole('option')
          .map((o) => o.textContent),
      ).toEqual(['Everyone I can see', 'Morgan Manager', 'Casey Contributor']),
    );
  });

  it('lets an admin include archived projects in the project filter', async () => {
    const api = await open(users.admin);

    await waitFor(() =>
      expect(
        within(filters().getByLabelText('Project', { selector: 'select' })).getByText(
          /BETA · Beta Portal \(archived\)/,
        ),
      ).toBeInTheDocument(),
    );
    expect(api.calls('GET /projects')[0]?.query.get('includeArchived')).toBe('true');
  });
});

describe('hours report: client-side validation (no request is sent)', () => {
  const runWith = async (apply: () => void) => {
    const api = await open();
    await screen.findByText('March 2026');
    const before = api.calls('GET /reports/hours').length;
    apply();
    await userEvent.click(filters().getByRole('button', { name: 'Run report' }));
    return { api, before };
  };

  it('rejects a start date after the end date', async () => {
    const { api, before } = await runWith(() => {
      fireEvent.change(filters().getByLabelText('From'), { target: { value: '2026-05-01' } });
      fireEvent.change(filters().getByLabelText('To'), { target: { value: '2026-04-01' } });
    });

    expect(screen.getByText('The start date cannot be after the end date')).toBeInTheDocument();
    expect(api.calls('GET /reports/hours')).toHaveLength(before);
  });

  it('rejects an empty date', async () => {
    const { api, before } = await runWith(() =>
      fireEvent.change(filters().getByLabelText('From'), { target: { value: '' } }),
    );

    expect(screen.getByText('Choose both dates')).toBeInTheDocument();
    expect(api.calls('GET /reports/hours')).toHaveLength(before);
  });

  it('rejects a range longer than 5 years', async () => {
    const { api, before } = await runWith(() =>
      fireEvent.change(filters().getByLabelText('From'), { target: { value: '2015-01-01' } }),
    );

    expect(screen.getByText('Choose a range of at most 5 years')).toBeInTheDocument();
    expect(api.calls('GET /reports/hours')).toHaveLength(before);
  });

  it('requires at least one grouping', async () => {
    const api = await open();
    await screen.findByText('March 2026');
    await userEvent.click(filters().getByLabelText('Month')); // untick the only grouping
    const before = api.calls('GET /reports/hours').length;

    await userEvent.click(filters().getByRole('button', { name: 'Run report' }));

    expect(screen.getByText('Choose at least one thing to group by')).toBeInTheDocument();
    expect(api.calls('GET /reports/hours')).toHaveLength(before);
  });
});
