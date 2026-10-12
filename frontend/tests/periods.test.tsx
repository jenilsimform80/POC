import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { LockedPeriod } from '../src/api/types';
import {
  fail,
  mockApi,
  noContent,
  ok,
  renderRoutes,
  signedInAs,
  users,
  type MockRequest,
} from './helpers';

const locked = (period: string, note: string | null = null): LockedPeriod => ({
  period,
  lockedAt: '2026-04-02T09:00:00.000Z',
  note,
  lockedBy: { id: 'u-admin', name: 'Alex Admin' },
});

function periodBackend(initial: LockedPeriod[]) {
  const state = { periods: [...initial] };
  const handlers = {
    ...signedInAs(users.admin),
    'GET /locked-periods': () =>
      ok({ lockedPeriods: [...state.periods].sort((a, b) => b.period.localeCompare(a.period)) }),
    'POST /locked-periods': (req: MockRequest) => {
      const body = req.body as { period: string; note?: string };
      const created = locked(body.period, body.note ?? null);
      state.periods.push(created);
      return ok({ lockedPeriod: created }, 201);
    },
    'POST /locked-periods/:period/unlock': (req: MockRequest) => {
      state.periods = state.periods.filter((p) => p.period !== req.params['period']);
      return noContent();
    },
  };
  return { state, handlers };
}
const open = async (backend: ReturnType<typeof periodBackend>, extra = {}) => {
  const api = mockApi({ ...backend.handlers, ...extra });
  renderRoutes('/periods');
  await screen.findByRole('heading', { name: 'Locked periods' });
  return api;
};
const lockForm = () => within(screen.getByRole('form', { name: 'Lock a month' }));

describe('locked periods (admin)', () => {
  it('is not shown to anyone else, and makes no API call', async () => {
    for (const user of [users.contributor, users.manager]) {
      const api = mockApi(signedInAs(user));
      const view = renderRoutes('/periods');

      expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
      expect(api.calls('GET /locked-periods')).toHaveLength(0);
      view.unmount();
    }
  });

  it('lists locked months with who locked them and the note', async () => {
    await open(periodBackend([locked('2026-03', 'March close'), locked('2026-02')]));

    const rows = await screen.findAllByRole('row');
    expect(within(rows[1]!).getByText('March 2026')).toBeInTheDocument(); // newest first
    expect(within(rows[1]!).getByText('March close')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Alex Admin')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('February 2026')).toBeInTheDocument();
  });

  it('shows an empty state when nothing is locked', async () => {
    await open(periodBackend([]));

    expect(await screen.findByText('No months are locked')).toBeInTheDocument();
  });

  it('shows a retryable error', async () => {
    let failing = true;
    const backend = periodBackend([locked('2026-03')]);
    mockApi({
      ...backend.handlers,
      'GET /locked-periods': () =>
        failing
          ? fail(500, 'INTERNAL_ERROR', 'An unexpected error occurred')
          : ok({ lockedPeriods: backend.state.periods }),
    });
    renderRoutes('/periods');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load locked periods');
    failing = false;
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('March 2026')).toBeInTheDocument();
  });
});

describe('locking a month', () => {
  it('requires a month and sends nothing otherwise', async () => {
    const api = await open(periodBackend([]));

    await userEvent.click(lockForm().getByRole('button', { name: 'Lock month' }));

    expect(lockForm().getByText('Choose the month to lock')).toBeInTheDocument();
    expect(api.calls('POST /locked-periods')).toHaveLength(0);
  });

  it('locks the chosen month with an optional note and refreshes the list', async () => {
    const api = await open(periodBackend([]));

    fireEvent.change(lockForm().getByLabelText('Month'), { target: { value: '2026-03' } });
    await userEvent.type(lockForm().getByLabelText('Note (optional)'), 'Invoiced');
    await userEvent.click(lockForm().getByRole('button', { name: 'Lock month' }));

    expect(await screen.findByText('March 2026')).toBeInTheDocument();
    expect(api.calls('POST /locked-periods')[0]?.body).toEqual({
      period: '2026-03',
      note: 'Invoiced',
    });
    expect(lockForm().getByLabelText('Month')).toHaveValue('');
  });

  it('shows the backend message when the month is already locked', async () => {
    await open(periodBackend([]), {
      'POST /locked-periods': fail(409, 'CONFLICT', 'Period 2026-03 is already locked'),
    });

    fireEvent.change(lockForm().getByLabelText('Month'), { target: { value: '2026-03' } });
    await userEvent.click(lockForm().getByRole('button', { name: 'Lock month' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Period 2026-03 is already locked');
  });
});

describe('unlocking a month', () => {
  it('requires a reason (at least 3 characters) before anything is sent', async () => {
    const api = await open(periodBackend([locked('2026-03')]));

    await userEvent.click(await screen.findByRole('button', { name: 'Unlock March 2026' }));
    const form = within(screen.getByRole('form', { name: 'Unlock March 2026' }));
    expect(form.getByText(/Entries in this month become editable again/)).toBeInTheDocument();
    await userEvent.type(form.getByLabelText('Reason'), 'ab');
    await userEvent.click(form.getByRole('button', { name: 'Unlock month' }));

    expect(form.getByText(/Give a reason/)).toBeInTheDocument();
    expect(api.calls('POST /locked-periods/:period/unlock')).toHaveLength(0);
  });

  it('unlocks with the reason and removes the month from the list', async () => {
    const api = await open(periodBackend([locked('2026-03'), locked('2026-02')]));

    await userEvent.click(await screen.findByRole('button', { name: 'Unlock March 2026' }));
    const form = within(screen.getByRole('form', { name: 'Unlock March 2026' }));
    await userEvent.type(form.getByLabelText('Reason'), '  Late invoice correction  ');
    await userEvent.click(form.getByRole('button', { name: 'Unlock month' }));

    await waitFor(() => expect(screen.queryByText('March 2026')).not.toBeInTheDocument());
    expect(screen.getByText('February 2026')).toBeInTheDocument();
    expect(api.calls('POST /locked-periods/:period/unlock')[0]?.params['period']).toBe('2026-03');
    expect(api.calls('POST /locked-periods/:period/unlock')[0]?.body).toEqual({
      reason: 'Late invoice correction',
    });
  });

  it('can be cancelled', async () => {
    const api = await open(periodBackend([locked('2026-03')]));

    await userEvent.click(await screen.findByRole('button', { name: 'Unlock March 2026' }));
    await userEvent.click(
      within(screen.getByRole('form', { name: 'Unlock March 2026' })).getByRole('button', {
        name: 'Cancel',
      }),
    );

    expect(screen.queryByRole('form', { name: 'Unlock March 2026' })).not.toBeInTheDocument();
    expect(api.calls('POST /locked-periods/:period/unlock')).toHaveLength(0);
  });

  it('shows the backend message when unlocking fails', async () => {
    await open(periodBackend([locked('2026-03')]), {
      'POST /locked-periods/:period/unlock': fail(404, 'NOT_FOUND', 'Period 2026-03 is not locked'),
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Unlock March 2026' }));
    const form = within(screen.getByRole('form', { name: 'Unlock March 2026' }));
    await userEvent.type(form.getByLabelText('Reason'), 'Correction');
    await userEvent.click(form.getByRole('button', { name: 'Unlock month' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Period 2026-03 is not locked');
  });
});
