import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Submission, SubmissionStatus } from '../src/api/types';
import { addDays } from '../src/lib/dates';
import {
  entry,
  fail,
  mockApi,
  ok,
  project,
  renderRoutes,
  signedInAs,
  users,
  week,
  type MockRequest,
} from './helpers';

const team = [
  { ...users.contributor },
  {
    id: 'u-dev2',
    email: 'dev2@example.com',
    name: 'Drew Contributor',
    role: 'CONTRIBUTOR' as const,
    managerId: 'u-mgr',
  },
];
const sub = (overrides: Partial<Submission> = {}): Submission => ({
  id: 's1',
  userId: 'u-dev',
  weekStart: '2026-03-02',
  status: 'SUBMITTED',
  submittedAt: '2026-03-06T10:00:00.000Z',
  updatedAt: '2026-03-06T10:00:00.000Z',
  ...overrides,
});

describe('approvals queue', () => {
  const queue = (items: Submission[], extra = {}) =>
    mockApi({
      ...signedInAs(users.manager),
      'GET /users': ok({ users: team }),
      'GET /submissions': (req: MockRequest) => {
        const status = req.query.get('status');
        return ok({ submissions: items.filter((s) => !status || s.status === status) });
      },
      ...extra,
    });

  it('lists what is waiting, with names, weeks and a review link', async () => {
    const api = queue([sub(), sub({ id: 's2', userId: 'u-dev2', weekStart: '2026-03-09' })]);

    renderRoutes('/approvals');

    const row = (await screen.findByText('Casey Contributor')).closest('tr')!;
    expect(within(row).getByText('2 Mar – 8 Mar 2026')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: /Review Casey Contributor/ })).toHaveAttribute(
      'href',
      '/approvals/s1',
    );
    expect(screen.getByText('Drew Contributor')).toBeInTheDocument();
    expect(api.calls('GET /submissions')[0]?.query.get('forApproval')).toBe('true');
    expect(api.calls('GET /submissions')[0]?.query.get('status')).toBe('SUBMITTED');
  });

  it('shows an encouraging empty state when nothing is pending', async () => {
    queue([]);

    renderRoutes('/approvals');

    expect(await screen.findByText('Nothing is waiting for you')).toBeInTheDocument();
  });

  it('switches to decided timesheets with the filter', async () => {
    const api = queue([sub(), sub({ id: 's9', status: 'APPROVED' as SubmissionStatus })]);
    renderRoutes('/approvals');
    await screen.findByText('Casey Contributor');

    await userEvent.selectOptions(screen.getByLabelText('Show'), 'APPROVED');

    await waitFor(() =>
      expect(api.calls('GET /submissions').at(-1)?.query.get('status')).toBe('APPROVED'),
    );
    expect(await screen.findByRole('link', { name: /Review Casey Contributor/ })).toHaveAttribute(
      'href',
      '/approvals/s9',
    );
    expect(screen.getByText('View')).toBeInTheDocument();
  });

  it('shows an error with retry when the queue cannot be loaded', async () => {
    let failing = true;
    mockApi({
      ...signedInAs(users.manager),
      'GET /users': ok({ users: team }),
      'GET /submissions': () =>
        failing
          ? fail(500, 'INTERNAL_ERROR', 'An unexpected error occurred')
          : ok({ submissions: [] }),
    });
    renderRoutes('/approvals');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load timesheets');
    failing = false;
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Nothing is waiting for you')).toBeInTheDocument();
  });

  it('does not show the screen (or call the API) to a contributor', async () => {
    const api = mockApi(signedInAs(users.contributor));

    renderRoutes('/approvals');

    expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
    expect(api.calls('GET /submissions')).toHaveLength(0);
  });
});

describe('reviewing one timesheet', () => {
  function reviewBackend(initial: Submission = sub(), extra: Record<string, unknown> = {}) {
    const state = { submission: initial };
    const handlers = {
      ...signedInAs(users.manager),
      'GET /projects': ok({ projects: [project()] }),
      'GET /users/:id': ok({ user: team[0] }),
      'GET /submissions/:id': () => ok({ submission: state.submission }),
      'GET /timesheets/:weekStart': (req: MockRequest) =>
        ok(
          week({
            weekStart: req.params['weekStart']!,
            weekEnd: addDays(req.params['weekStart']!, 6),
            entries: [
              entry({ id: 'e1', hours: 8, notes: 'Planning' }),
              entry({ id: 'e2', workDate: '2026-03-04', hours: 3, isBillable: false }),
            ],
            status: state.submission.status,
            warnings: [
              {
                code: 'DAILY_HOURS_HIGH',
                message: '11 hours logged on 2026-03-02 (more than 10)',
                total: 11,
                threshold: 10,
                date: '2026-03-02',
              },
            ],
          }),
        ),
      'POST /submissions/:id/approve': (req: MockRequest) => {
        state.submission = {
          ...state.submission,
          status: 'APPROVED',
          approvals: [
            {
              id: 'a1',
              managerId: 'u-mgr',
              decision: 'APPROVED',
              comment: (req.body as { comment?: string }).comment ?? null,
              decidedAt: '2026-03-07T09:00:00.000Z',
            },
          ],
        };
        return ok({ submission: state.submission });
      },
      'POST /submissions/:id/reject': (req: MockRequest) => {
        state.submission = {
          ...state.submission,
          status: 'REJECTED',
          approvals: [
            {
              id: 'a2',
              managerId: 'u-mgr',
              decision: 'REJECTED',
              comment: (req.body as { comment: string }).comment,
              decidedAt: '2026-03-07T09:00:00.000Z',
            },
          ],
        };
        return ok({ submission: state.submission });
      },
      ...extra,
    };
    return { state, handlers };
  }
  const open = async (backend: ReturnType<typeof reviewBackend>) => {
    const api = mockApi(backend.handlers);
    renderRoutes('/approvals/s1');
    await screen.findByRole('heading', { name: /Casey Contributor/ });
    return api;
  };

  it('shows the person, totals, warnings and every entry — read-only', async () => {
    await open(reviewBackend());

    expect(screen.getByRole('heading', { name: /Casey Contributor/ })).toHaveTextContent(
      '2 Mar – 8 Mar 2026',
    );
    expect(screen.getByText('11 h', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText('8 h billable')).toBeInTheDocument();
    expect(screen.getByText('3 h non-billable')).toBeInTheDocument();
    expect(screen.getByText(/11 hours logged on 2026-03-02/)).toBeInTheDocument();
    expect(screen.getByText('Planning')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Edit entry|Delete entry|Add entry/ }),
    ).not.toBeInTheDocument();
  });

  it('loads the week of the submission’s owner (not the manager’s own)', async () => {
    const api = await open(reviewBackend());

    const request = api.calls('GET /timesheets/:weekStart')[0]!;
    expect(request.params['weekStart']).toBe('2026-03-02');
    expect(request.query.get('userId')).toBe('u-dev');
  });

  it('approves without a comment, shows confirmation and the new status', async () => {
    const api = await open(reviewBackend());

    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));

    expect(await screen.findByText(/Timesheet approved\./)).toBeInTheDocument();
    expect(api.calls('POST /submissions/:id/approve')[0]?.body).toEqual({});
    expect(await screen.findByText('Already decided')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Decision history' })).getByText('Approved'),
    ).toBeInTheDocument();
  });

  it('sends the optional comment with an approval', async () => {
    const api = await open(reviewBackend());

    await userEvent.type(screen.getByLabelText('Comment'), '  Thanks!  ');
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));

    await waitFor(() => expect(api.calls('POST /submissions/:id/approve')).toHaveLength(1));
    expect(api.calls('POST /submissions/:id/approve')[0]?.body).toEqual({ comment: 'Thanks!' });
  });

  it('refuses to reject without a reason (no request is sent)', async () => {
    const api = await open(reviewBackend());

    await userEvent.type(screen.getByLabelText('Comment'), '   ');
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));

    expect(screen.getByText(/Explain what needs to change/)).toBeInTheDocument();
    expect(api.calls('POST /submissions/:id/reject')).toHaveLength(0);
  });

  it('rejects with a reason and shows it in the decision history', async () => {
    const api = await open(reviewBackend());

    await userEvent.type(screen.getByLabelText('Comment'), 'Friday is missing');
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));

    expect(await screen.findByText(/Timesheet rejected\./)).toBeInTheDocument();
    expect(api.calls('POST /submissions/:id/reject')[0]?.body).toEqual({
      comment: 'Friday is missing',
    });
    expect(await screen.findByText(/Friday is missing/, { selector: 'li' })).toBeInTheDocument();
  });

  it.each([
    ['not their report', 404, 'NOT_FOUND', 'Submission not found'],
    [
      'already decided elsewhere',
      409,
      'INVALID_STATE',
      'Only a submitted timesheet can be approved or rejected',
    ],
  ])(
    'shows the backend message when the decision is refused (%s)',
    async (_label, status, code, message) => {
      await open(
        reviewBackend(sub(), { 'POST /submissions/:id/approve': fail(status, code, message) }),
      );

      await userEvent.click(screen.getByRole('button', { name: 'Approve' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
    },
  );

  it('explains a rejection blocked by a locked billing period', async () => {
    await open(
      reviewBackend(sub(), {
        'POST /submissions/:id/reject': fail(
          409,
          'PERIOD_LOCKED',
          'Period 2026-03 is locked and cannot be modified',
        ),
      }),
    );

    await userEvent.type(screen.getByLabelText('Comment'), 'fix it');
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Period 2026-03 is locked');
  });

  it('shows an already-decided timesheet without a decision form', async () => {
    const decided = sub({
      status: 'APPROVED',
      approvals: [
        {
          id: 'a0',
          managerId: 'u-mgr',
          decision: 'APPROVED',
          comment: 'ok',
          decidedAt: '2026-03-07T09:00:00.000Z',
        },
      ],
    });
    await open(reviewBackend(decided));

    expect(screen.getByText('Already decided')).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Decision' })).not.toBeInTheDocument();
  });

  it('shows "not found" feedback when the submission is not visible to the manager', async () => {
    mockApi({
      ...signedInAs(users.manager),
      'GET /submissions/:id': fail(404, 'NOT_FOUND', 'Submission not found'),
    });

    renderRoutes('/approvals/zzz');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load this timesheet');
    expect(alert).toHaveTextContent('Submission not found');
  });
});
