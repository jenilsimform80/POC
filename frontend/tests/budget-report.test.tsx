import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { BudgetProject, BudgetReport } from '../src/api/types';
import { fail, mockApi, ok, renderRoutes, signedInAs, users } from './helpers';

const row = (overrides: Partial<BudgetProject>): BudgetProject => ({
  projectId: 'p1',
  code: 'ALPHA',
  name: 'Alpha',
  isActive: true,
  budgetHours: 40,
  loggedHours: 25,
  billableHours: 23,
  nonBillableHours: 2,
  remainingHours: 15,
  percentUsed: 62.5,
  status: 'OK',
  ...overrides,
});
const report = (projects: BudgetProject[]): BudgetReport => ({
  through: null,
  projects,
  totals: {
    budgetHours: projects.reduce((s, p) => s + p.budgetHours, 0),
    loggedHours: projects.reduce((s, p) => s + p.loggedHours, 0),
  },
});

const open = async (projects: BudgetProject[], extra = {}) => {
  const api = mockApi({
    ...signedInAs(users.admin),
    'GET /reports/project-budgets': ok(report(projects)),
    ...extra,
  });
  renderRoutes('/reports/budgets');
  await screen.findByRole('heading', { name: 'Project budgets' });
  return api;
};
const rowFor = (code: string) =>
  within(screen.getByRole('rowheader', { name: new RegExp(code) }).closest('tr')!);

describe('budget report (admin)', () => {
  it.each([users.contributor, users.manager])(
    'is not shown to a %s.role and makes no API call',
    async (user) => {
      const api = mockApi(signedInAs(user));

      renderRoutes('/reports/budgets');

      expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
      expect(api.calls('GET /reports/project-budgets')).toHaveLength(0);
    },
  );

  it('shows logged vs allocated hours with usage and status for every project', async () => {
    await open([
      row({}),
      row({
        projectId: 'p2',
        code: 'BETA',
        name: 'Beta',
        budgetHours: 10,
        loggedHours: 8,
        billableHours: 8,
        nonBillableHours: 0,
        remainingHours: 2,
        percentUsed: 80,
        status: 'WARNING',
      }),
      row({
        projectId: 'p3',
        code: 'GAMMA',
        name: 'Gamma',
        budgetHours: 10,
        loggedHours: 10.25,
        billableHours: 10.25,
        nonBillableHours: 0,
        remainingHours: -0.25,
        percentUsed: 102.5,
        status: 'OVER',
      }),
      row({
        projectId: 'p4',
        code: 'DELTA',
        name: 'Delta',
        budgetHours: 0,
        loggedHours: 0,
        billableHours: 0,
        nonBillableHours: 0,
        remainingHours: 0,
        percentUsed: null,
        status: 'OK',
      }),
    ]);

    const alpha = await waitFor(() => rowFor('ALPHA'));
    expect(alpha.getAllByRole('cell').map((c) => c.textContent)).toEqual([
      '40',
      '25',
      '23',
      '2',
      '15',
      '62.5%',
      'On track',
    ]);
    expect(alpha.getByRole('progressbar', { name: 'ALPHA budget used' })).toHaveAttribute(
      'value',
      '62.5',
    );
    expect(rowFor('BETA').getByText('Nearly used')).toBeInTheDocument();
    expect(rowFor('GAMMA').getByText('Over budget')).toBeInTheDocument();
    expect(rowFor('GAMMA').getByText('-0.25')).toBeInTheDocument(); // overspend is visible
    expect(rowFor('GAMMA').getByRole('progressbar')).toHaveAttribute('value', '100'); // bar caps at 100
    expect(rowFor('GAMMA').getByText('102.5%')).toBeInTheDocument(); // the number is not capped
    expect(rowFor('DELTA').getByText('No budget set')).toBeInTheDocument();
    expect(rowFor('DELTA').queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('shows totals', async () => {
    await open([
      row({}),
      row({ projectId: 'p2', code: 'BETA', name: 'Beta', budgetHours: 10, loggedHours: 6.5 }),
    ]);

    const footer = (await screen.findAllByRole('row')).at(-1)!;
    expect(
      within(footer)
        .getAllByRole('cell')
        .slice(0, 3)
        .map((c) => c.textContent),
    ).toEqual(['Total', '50', '31.5']);
  });

  it('marks archived projects when included, and asks the backend for them', async () => {
    const api = await open([
      row({}),
      row({ projectId: 'p9', code: 'OLD', name: 'Old', isActive: false }),
    ]);

    await userEvent.click(screen.getByLabelText('Include archived projects'));

    await waitFor(() =>
      expect(api.calls('GET /reports/project-budgets').at(-1)?.query.get('includeArchived')).toBe(
        'true',
      ),
    );
    expect((await waitFor(() => rowFor('OLD'))).getByText('Archived')).toBeInTheDocument();
  });

  it('sends a through-date snapshot, and ignores an incomplete date', async () => {
    const api = await open([row({})]);

    fireEvent.change(screen.getByLabelText('Hours up to (optional)'), {
      target: { value: '2026-03-31' },
    });

    await waitFor(() =>
      expect(api.calls('GET /reports/project-budgets').at(-1)?.query.get('through')).toBe(
        '2026-03-31',
      ),
    );
    fireEvent.change(screen.getByLabelText('Hours up to (optional)'), { target: { value: '' } });
    await waitFor(() =>
      expect(api.calls('GET /reports/project-budgets').at(-1)?.query.get('through')).toBeNull(),
    );
  });

  it('shows an empty state', async () => {
    await open([]);

    expect(await screen.findByText('No projects to report on')).toBeInTheDocument();
  });

  it('shows a retryable error', async () => {
    let failing = true;
    await open([row({})], {
      'GET /reports/project-budgets': () =>
        failing
          ? fail(500, 'INTERNAL_ERROR', 'An unexpected error occurred')
          : ok(report([row({})])),
    });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load the budget report');
    failing = false;
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('rowheader', { name: /ALPHA/ })).toBeInTheDocument();
  });
});
