import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Submission, TimeEntry, TimesheetWarning, WeekStatus } from '../src/api/types';
import { addDays } from '../src/lib/dates';
import {
  entry,
  fail,
  mockApi,
  noContent,
  ok,
  project,
  renderRoutes,
  signedInAs,
  users,
  week,
  type MockRequest,
} from './helpers';

const WEEK = '2026-03-02'; // Monday
const projects = [
  project(),
  project({
    id: 'p2',
    code: 'BETA',
    name: 'Beta Portal',
    tasks: [{ id: 't3', name: 'Support', isActive: true }],
  }),
];

/** A tiny in-memory backend for the timesheet endpoints, so create/edit/delete really change the next GET. */
function fakeBackend(
  initial: TimeEntry[] = [],
  options: {
    status?: WeekStatus;
    warnings?: TimesheetWarning[];
    lockedMonths?: string[];
    submissions?: Submission[];
  } = {},
) {
  const state = {
    entries: [...initial],
    status: options.status ?? 'DRAFT',
    nextId: 100,
  };
  const handlers = {
    ...signedInAs(users.contributor),
    'GET /projects': ok({ projects }),
    'GET /locked-periods': ok({
      lockedPeriods: (options.lockedMonths ?? []).map((period) => ({
        period,
        lockedAt: '2026-04-01T00:00:00.000Z',
        note: null,
        lockedBy: { id: 'u-admin', name: 'Alex Admin' },
      })),
    }),
    'GET /submissions': ok({ submissions: options.submissions ?? [] }),
    'GET /timesheets/:weekStart': (req: MockRequest) => {
      const start = req.params['weekStart']!;
      const inWeek = state.entries.filter(
        (e) => e.workDate >= start && e.workDate <= addDays(start, 6),
      );
      return ok(
        week({
          weekStart: start,
          weekEnd: addDays(start, 6),
          entries: inWeek,
          status: state.status,
          warnings: options.warnings ?? [],
          submission:
            state.status === 'DRAFT'
              ? null
              : {
                  id: 's1',
                  status: state.status,
                  submittedAt: '2026-03-06T10:00:00.000Z',
                },
        }),
      );
    },
    'POST /time-entries': (req: MockRequest) => {
      const body = req.body as Partial<TimeEntry>;
      const created = entry({ id: `e${state.nextId++}`, ...body });
      state.entries.push(created);
      return ok({ entry: created, warnings: [] }, 201);
    },
    'PATCH /time-entries/:id': (req: MockRequest) => {
      const index = state.entries.findIndex((e) => e.id === req.params['id']);
      state.entries[index] = { ...state.entries[index]!, ...(req.body as Partial<TimeEntry>) };
      return ok({ entry: state.entries[index], warnings: [] });
    },
    'DELETE /time-entries/:id': (req: MockRequest) => {
      state.entries = state.entries.filter((e) => e.id !== req.params['id']);
      return noContent();
    },
    'POST /submissions': () => {
      state.status = 'SUBMITTED';
      return ok(
        {
          submission: {
            id: 's1',
            userId: 'u-dev',
            weekStart: WEEK,
            status: 'SUBMITTED',
            submittedAt: '2026-03-06T10:00:00.000Z',
            updatedAt: '2026-03-06T10:00:00.000Z',
          },
        },
        201,
      );
    },
  };
  return { state, handlers };
}

const open = async (backend: ReturnType<typeof fakeBackend>, extra = {}) => {
  const api = mockApi({ ...backend.handlers, ...extra });
  const view = renderRoutes(`/timesheet?week=${WEEK}`);
  await screen.findByRole('heading', { name: 'Timesheet' });
  await screen.findByText('total');
  return { api, ...view };
};
const day = (label: string) => within(screen.getByRole('region', { name: label }));

describe('timesheet: viewing a week', () => {
  it('groups entries by day with totals, labels and the billable split', async () => {
    const backend = fakeBackend([
      entry({ id: 'e1', workDate: '2026-03-02', hours: 8, notes: 'Sprint planning' }),
      entry({
        id: 'e2',
        workDate: '2026-03-02',
        hours: 1.5,
        isBillable: false,
        projectId: 'p2',
        taskId: 't3',
      }),
      entry({ id: 'e3', workDate: '2026-03-04', hours: 6 }),
    ]);

    await open(backend);

    expect(screen.getByText('15.5 h', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText('14 h billable')).toBeInTheDocument();
    expect(screen.getByText('1.5 h non-billable')).toBeInTheDocument();
    const monday = day('Mon 2 Mar');
    expect(monday.getByText('ALPHA · Alpha Platform')).toBeInTheDocument();
    expect(monday.getByText(/Build/)).toBeInTheDocument();
    expect(monday.getByText('Sprint planning')).toBeInTheDocument();
    expect(monday.getByText('BETA · Beta Portal')).toBeInTheDocument();
    expect(monday.getByText('Non-billable')).toBeInTheDocument();
    expect(monday.getByText('9.5 h')).toBeInTheDocument();
    expect(day('Tue 3 Mar').getByText('No time logged.')).toBeInTheDocument();
    expect(day('Wed 4 Mar').getAllByText('6 h')).toHaveLength(2); // day total + the entry
  });

  it('shows a loading state and then a retryable error when the API fails', async () => {
    let fails = true;
    const backend = fakeBackend();
    mockApi({
      ...backend.handlers,
      'GET /timesheets/:weekStart': (req: MockRequest) =>
        fails
          ? fail(500, 'INTERNAL_ERROR', 'An unexpected error occurred')
          : backend.handlers['GET /timesheets/:weekStart'](req),
    });

    renderRoutes(`/timesheet?week=${WEEK}`);

    expect(await screen.findByText('Loading your timesheet…')).toBeInTheDocument();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load your timesheet');
    expect(alert).toHaveTextContent('An unexpected error occurred');

    fails = false;
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('total')).toBeInTheDocument();
  });

  it('shows backend warnings without blocking anything', async () => {
    const backend = fakeBackend([entry({ hours: 11 })], {
      warnings: [
        {
          code: 'DAILY_HOURS_HIGH',
          message: '11 hours logged on 2026-03-02 (more than 10)',
          total: 11,
          threshold: 10,
          date: '2026-03-02',
        },
      ],
    });

    await open(backend);

    expect(screen.getByText('Heads-up (does not stop you saving)')).toBeInTheDocument();
    expect(screen.getByText(/11 hours logged on 2026-03-02/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add entry on Tue 3 Mar' })).toBeEnabled();
  });

  it('navigates between weeks and back to this week', async () => {
    const backend = fakeBackend([entry({ workDate: '2026-03-10', hours: 3 })]);
    const api = await open(backend);

    await userEvent.click(screen.getByRole('button', { name: 'Next week' }));

    expect(await screen.findByText('9 Mar – 15 Mar 2026')).toBeInTheDocument();
    await waitFor(() =>
      expect(api.api.calls('GET /timesheets/:weekStart').at(-1)?.params['weekStart']).toBe(
        '2026-03-09',
      ),
    );
    expect(await screen.findByRole('region', { name: 'Tue 10 Mar' })).toBeInTheDocument();
    expect(day('Tue 10 Mar').getAllByText('3 h')).toHaveLength(2);

    await userEvent.click(screen.getByRole('button', { name: 'Previous week' }));
    expect(await screen.findByText('2 Mar – 8 Mar 2026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'This week' })).toBeEnabled();
  });

  it('falls back to the current week for an invalid ?week= value', async () => {
    const backend = fakeBackend();
    const api = mockApi(backend.handlers);

    renderRoutes('/timesheet?week=garbage');
    await screen.findByText('total');

    expect(api.calls('GET /timesheets/:weekStart')[0]?.params['weekStart']).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
    expect(api.calls('GET /timesheets/:weekStart')[0]?.params['weekStart']).not.toBe('garbage');
  });
});

describe('timesheet: adding entries', () => {
  async function fill(date: string, project: string, task: string, hours: string) {
    const form = within(screen.getByRole('form', { name: 'Add time entry' }));
    await userEvent.selectOptions(form.getByLabelText('Project'), project);
    await userEvent.selectOptions(form.getByLabelText('Task'), task);
    const dateInput = form.getByLabelText('Date');
    expect(dateInput).toHaveValue(date);
    await userEvent.type(form.getByLabelText('Hours'), hours);
    return form;
  }

  it('creates an entry for the chosen day and shows it after reloading', async () => {
    const backend = fakeBackend();
    const { api } = await open(backend);

    await userEvent.click(screen.getByRole('button', { name: 'Add entry on Tue 3 Mar' }));
    const form = await fill('2026-03-03', 'p1', 't2', '6.5');
    await userEvent.type(form.getByLabelText('Notes (optional)'), '  code review  ');
    await userEvent.click(form.getByRole('button', { name: 'Add entry' }));

    await waitFor(() => expect(day('Tue 3 Mar').getAllByText('6.5 h')).toHaveLength(2));
    expect(api.calls('POST /time-entries')).toHaveLength(1);
    expect(api.calls('POST /time-entries')[0]?.body).toEqual({
      projectId: 'p1',
      taskId: 't2',
      workDate: '2026-03-03',
      hours: 6.5,
      isBillable: true,
      notes: 'code review',
    });
    expect(screen.queryByRole('form', { name: 'Add time entry' })).not.toBeInTheDocument();
  });

  it('lets the user mark an entry non-billable', async () => {
    const backend = fakeBackend();
    const { api } = await open(backend);

    await userEvent.click(screen.getByRole('button', { name: 'Add entry on Mon 2 Mar' }));
    const form = await fill('2026-03-02', 'p2', 't3', '2');
    await userEvent.click(form.getByLabelText('Billable'));
    await userEvent.click(form.getByRole('button', { name: 'Add entry' }));

    await waitFor(() => expect(api.calls('POST /time-entries')).toHaveLength(1));
    expect(api.calls('POST /time-entries')[0]?.body).toMatchObject({ isBillable: false });
    expect(await day('Mon 2 Mar').findByText('Non-billable')).toBeInTheDocument();
  });

  it('offers only the chosen project’s tasks', async () => {
    const backend = fakeBackend();
    await open(backend);
    await userEvent.click(screen.getByRole('button', { name: 'Add entry on Mon 2 Mar' }));
    const form = within(screen.getByRole('form', { name: 'Add time entry' }));

    await userEvent.selectOptions(form.getByLabelText('Project'), 'p2');

    expect(
      within(form.getByLabelText('Task'))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Select a task…', 'Support']);
  });

  it('validates on the client and sends nothing when the form is incomplete', async () => {
    const backend = fakeBackend();
    const { api } = await open(backend);
    await userEvent.click(screen.getByRole('button', { name: 'Add entry on Mon 2 Mar' }));
    const form = within(screen.getByRole('form', { name: 'Add time entry' }));

    await userEvent.click(form.getByRole('button', { name: 'Add entry' }));

    expect(form.getByText('Choose a project')).toBeInTheDocument();
    expect(form.getByText('Choose a task')).toBeInTheDocument();
    expect(form.getByText(/Enter hours in steps of 0.25/)).toBeInTheDocument();
    expect(api.calls('POST /time-entries')).toHaveLength(0);
  });

  it.each(['0', '0.1', '24.25', '25', '-1'])('rejects %s hours on the client', async (value) => {
    const backend = fakeBackend();
    const { api } = await open(backend);
    await userEvent.click(screen.getByRole('button', { name: 'Add entry on Mon 2 Mar' }));
    const form = await fill('2026-03-02', 'p1', 't1', value);

    await userEvent.click(form.getByRole('button', { name: 'Add entry' }));

    expect(form.getByText(/Enter hours in steps of 0.25/)).toBeInTheDocument();
    expect(api.calls('POST /time-entries')).toHaveLength(0);
  });

  it('shows the backend’s field error next to the field', async () => {
    const backend = fakeBackend();
    await open(backend, {
      'POST /time-entries': fail(400, 'VALIDATION_ERROR', 'Request validation failed', [
        { location: 'body', path: 'hours', message: 'Too big: expected number to be <=24' },
      ]),
    });
    await userEvent.click(screen.getByRole('button', { name: 'Add entry on Mon 2 Mar' }));
    const form = await fill('2026-03-02', 'p1', 't1', '8');

    await userEvent.click(form.getByRole('button', { name: 'Add entry' }));

    expect(await form.findByText('Too big: expected number to be <=24')).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'Add time entry' })).toBeInTheDocument(); // stays open
  });

  it.each([
    ['PERIOD_LOCKED', 409, 'Period 2026-03 is locked and cannot be modified'],
    [
      'DAILY_LIMIT_EXCEEDED',
      422,
      'Total hours for 2026-03-02 would be 26, exceeding the 24-hour daily limit',
    ],
    ['WEEK_NOT_EDITABLE', 409, 'This week has been submitted and can no longer be edited'],
  ])('shows the backend message for %s and keeps the form open', async (code, status, message) => {
    const backend = fakeBackend();
    await open(backend, { 'POST /time-entries': fail(status, code, message) });
    await userEvent.click(screen.getByRole('button', { name: 'Add entry on Mon 2 Mar' }));
    const form = await fill('2026-03-02', 'p1', 't1', '8');

    await userEvent.click(form.getByRole('button', { name: 'Add entry' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('form', { name: 'Add time entry' })).toBeInTheDocument();
    expect(form.getByRole('button', { name: 'Add entry' })).toBeEnabled();
  });

  it('can be cancelled without sending anything', async () => {
    const backend = fakeBackend();
    const { api } = await open(backend);
    await userEvent.click(screen.getByRole('button', { name: 'Add entry on Mon 2 Mar' }));

    await userEvent.click(
      within(screen.getByRole('form', { name: 'Add time entry' })).getByRole('button', {
        name: 'Cancel',
      }),
    );

    expect(screen.queryByRole('form', { name: 'Add time entry' })).not.toBeInTheDocument();
    expect(api.calls('POST /time-entries')).toHaveLength(0);
  });
});

describe('timesheet: editing and deleting', () => {
  it('sends only the changed field when editing', async () => {
    const backend = fakeBackend([entry({ id: 'e1', hours: 8 })]);
    const { api } = await open(backend);

    await userEvent.click(
      screen.getByRole('button', { name: 'Edit entry ALPHA · Alpha Platform' }),
    );
    const form = within(screen.getByRole('form', { name: 'Edit time entry' }));
    await userEvent.clear(form.getByLabelText('Hours'));
    await userEvent.type(form.getByLabelText('Hours'), '5');
    await userEvent.click(form.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(day('Mon 2 Mar').getAllByText('5 h')).toHaveLength(2));
    expect(api.calls('PATCH /time-entries/:id')[0]?.body).toEqual({ hours: 5 });
  });

  it('sends project and task together when the project changes, and clears notes with null', async () => {
    const backend = fakeBackend([entry({ id: 'e1', notes: 'old note' })]);
    const { api } = await open(backend);

    await userEvent.click(
      screen.getByRole('button', { name: 'Edit entry ALPHA · Alpha Platform' }),
    );
    const form = within(screen.getByRole('form', { name: 'Edit time entry' }));
    await userEvent.selectOptions(form.getByLabelText('Project'), 'p2');
    await userEvent.selectOptions(form.getByLabelText('Task'), 't3');
    await userEvent.clear(form.getByLabelText('Notes (optional)'));
    await userEvent.click(form.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(api.calls('PATCH /time-entries/:id')).toHaveLength(1));
    expect(api.calls('PATCH /time-entries/:id')[0]?.body).toEqual({
      projectId: 'p2',
      taskId: 't3',
      notes: null,
    });
  });

  it('does not call the API when nothing changed', async () => {
    const backend = fakeBackend([entry({ id: 'e1' })]);
    const { api } = await open(backend);

    await userEvent.click(
      screen.getByRole('button', { name: 'Edit entry ALPHA · Alpha Platform' }),
    );
    await userEvent.click(
      within(screen.getByRole('form', { name: 'Edit time entry' })).getByRole('button', {
        name: 'Save changes',
      }),
    );

    expect(api.calls('PATCH /time-entries/:id')).toHaveLength(0);
    expect(screen.queryByRole('form', { name: 'Edit time entry' })).not.toBeInTheDocument();
  });

  it('lets the owner correct hours of an entry whose project was archived since', async () => {
    const backend = fakeBackend([
      entry({ id: 'e1', projectId: 'p-old', taskId: 't-old', hours: 4 }),
    ]);
    const { api } = await open(backend);
    expect(day('Mon 2 Mar').getByText('Archived project')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Edit entry Archived project' }));
    const form = within(screen.getByRole('form', { name: 'Edit time entry' }));
    await userEvent.clear(form.getByLabelText('Hours'));
    await userEvent.type(form.getByLabelText('Hours'), '3');
    await userEvent.click(form.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(api.calls('PATCH /time-entries/:id')).toHaveLength(1));
    expect(api.calls('PATCH /time-entries/:id')[0]?.body).toEqual({ hours: 3 }); // project/task untouched
  });

  it('deletes only after an explicit confirmation', async () => {
    const backend = fakeBackend([entry({ id: 'e1' })]);
    const { api } = await open(backend);

    await userEvent.click(
      screen.getByRole('button', { name: 'Delete entry ALPHA · Alpha Platform' }),
    );
    expect(api.calls('DELETE /time-entries/:id')).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Keep' }));
    expect(screen.getByText('ALPHA · Alpha Platform')).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Delete entry ALPHA · Alpha Platform' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete' }));

    await waitFor(() =>
      expect(screen.queryByText('ALPHA · Alpha Platform')).not.toBeInTheDocument(),
    );
    expect(api.calls('DELETE /time-entries/:id')).toHaveLength(1);
  });

  it('shows why a delete failed and keeps the entry', async () => {
    const backend = fakeBackend([entry({ id: 'e1' })]);
    await open(backend, {
      'DELETE /time-entries/:id': fail(
        409,
        'PERIOD_LOCKED',
        'Period 2026-03 is locked and cannot be modified',
      ),
    });

    await userEvent.click(
      screen.getByRole('button', { name: 'Delete entry ALPHA · Alpha Platform' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Period 2026-03 is locked');
    expect(screen.getByText('ALPHA · Alpha Platform')).toBeInTheDocument();
  });
});

describe('timesheet: frozen weeks and locked months (UI mirrors, never enforces)', () => {
  it.each(['SUBMITTED', 'APPROVED'] as const)(
    'hides every edit control for a %s week',
    async (status) => {
      const backend = fakeBackend([entry({ id: 'e1' })], { status });

      await open(backend);

      expect(screen.queryByRole('button', { name: /Add entry on/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Edit entry/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Delete entry/ })).not.toBeInTheDocument();
      expect(screen.getAllByText('This week is submitted and cannot be edited.')).toHaveLength(7);
    },
  );

  it('disables editing in a locked month and says why', async () => {
    const backend = fakeBackend([entry({ id: 'e1' })], { lockedMonths: ['2026-03'] });

    await open(backend);

    expect(screen.queryByRole('button', { name: /Add entry on/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Edit entry/ })).not.toBeInTheDocument();
    expect(screen.getAllByText('This month is locked for billing.')).toHaveLength(7);
  });

  it('only locks the days that fall in the locked month (a week can span two months)', async () => {
    const backend = fakeBackend([], { lockedMonths: ['2026-03'] });
    mockApi(backend.handlers);

    renderRoutes('/timesheet?week=2026-02-23'); // Mon 23 Feb .. Sun 1 Mar
    await screen.findByText('total');

    expect(screen.getByRole('button', { name: 'Add entry on Fri 27 Feb' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Add entry on Sun 1 Mar' }),
    ).not.toBeInTheDocument();
    expect(day('Sun 1 Mar').getByText('This month is locked for billing.')).toBeInTheDocument();
  });
});

describe('timesheet: weekly submission', () => {
  it('cannot submit an empty week', async () => {
    await open(fakeBackend());

    expect(screen.getByRole('button', { name: 'Submit week for approval' })).toBeDisabled();
    expect(screen.getByText('Add at least one entry to submit this week.')).toBeInTheDocument();
  });

  it('submits after confirmation, then shows the frozen "submitted" state', async () => {
    const backend = fakeBackend([entry({ id: 'e1' })]);
    const { api } = await open(backend);

    await userEvent.click(screen.getByRole('button', { name: 'Submit week for approval' }));
    expect(api.calls('POST /submissions')).toHaveLength(0); // confirmation first
    await userEvent.click(screen.getByRole('button', { name: 'Yes, submit' }));

    expect(await screen.findByText('Submitted', { selector: 'strong' })).toBeInTheDocument();
    expect(api.calls('POST /submissions')[0]?.body).toEqual({ weekStart: WEEK });
    expect(screen.getByText(/Waiting for your manager/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add entry on/ })).not.toBeInTheDocument();
    expect(api.calls('GET /submissions').length).toBeGreaterThan(1); // history refreshed
  });

  it('can back out of the confirmation', async () => {
    const backend = fakeBackend([entry({ id: 'e1' })]);
    const { api } = await open(backend);

    await userEvent.click(screen.getByRole('button', { name: 'Submit week for approval' }));
    await userEvent.click(
      within(screen.getByRole('group', { name: 'Confirm submit' })).getByRole('button', {
        name: 'Cancel',
      }),
    );

    expect(api.calls('POST /submissions')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Submit week for approval' })).toBeInTheDocument();
  });

  it('shows the backend’s reason when submitting is refused (e.g. no manager)', async () => {
    const backend = fakeBackend([entry({ id: 'e1' })]);
    await open(backend, {
      'POST /submissions': fail(
        422,
        'BUSINESS_RULE_VIOLATION',
        'You have no manager assigned to approve your timesheet',
      ),
    });

    await userEvent.click(screen.getByRole('button', { name: 'Submit week for approval' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, submit' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('You have no manager assigned');
    expect(screen.getByRole('button', { name: 'Yes, submit' })).toBeEnabled();
  });

  it('shows the manager’s reason for a rejection and allows editing and resubmitting', async () => {
    const backend = fakeBackend([entry({ id: 'e1' })], { status: 'REJECTED' });
    const { api } = await open(backend, {
      'GET /submissions/:id': ok({
        submission: {
          id: 's1',
          userId: 'u-dev',
          weekStart: WEEK,
          status: 'REJECTED',
          submittedAt: '2026-03-06T10:00:00.000Z',
          updatedAt: '2026-03-07T10:00:00.000Z',
          approvals: [
            {
              id: 'a1',
              managerId: 'u-mgr',
              decision: 'REJECTED',
              comment: 'Friday is missing',
              decidedAt: '2026-03-07T10:00:00.000Z',
            },
          ],
        },
      }),
    });

    expect(await screen.findByText(/Friday is missing/)).toBeInTheDocument();
    expect(screen.getByText('Rejected: please fix and resubmit')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add entry on Fri 6 Mar' })).toBeInTheDocument(); // editable again
    await userEvent.click(screen.getByRole('button', { name: 'Resubmit week for approval' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, submit' }));

    await waitFor(() => expect(api.calls('POST /submissions')).toHaveLength(1));
  });

  it('shows approval as final', async () => {
    await open(fakeBackend([entry({ id: 'e1' })], { status: 'APPROVED' }));

    expect(screen.getByText('Approved', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText(/can no longer be edited/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /submit/i })).not.toBeInTheDocument();
  });
});

describe('timesheet: submission history', () => {
  it('lists past submissions with links to those weeks', async () => {
    const backend = fakeBackend([], {
      submissions: [
        {
          id: 's2',
          userId: 'u-dev',
          weekStart: '2026-02-23',
          status: 'APPROVED',
          submittedAt: '2026-03-01T10:00:00.000Z',
          updatedAt: '2026-03-02T10:00:00.000Z',
        },
        {
          id: 's3',
          userId: 'u-dev',
          weekStart: '2026-02-16',
          status: 'REJECTED',
          submittedAt: '2026-02-22T10:00:00.000Z',
          updatedAt: '2026-02-23T10:00:00.000Z',
        },
      ],
    });
    await open(backend);

    const history = within(screen.getByRole('region', { name: 'Submission history' }));
    expect(history.getByRole('link', { name: '23 Feb – 1 Mar 2026' })).toHaveAttribute(
      'href',
      '/timesheet?week=2026-02-23',
    );
    expect(history.getByText('Approved')).toBeInTheDocument();
    expect(history.getByText('Rejected')).toBeInTheDocument();
  });

  it('shows an empty state when nothing was submitted yet', async () => {
    await open(fakeBackend());

    expect(screen.getByText('No submissions yet')).toBeInTheDocument();
  });
});
