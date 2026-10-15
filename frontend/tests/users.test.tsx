import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { User } from '../src/api/types';
import { fail, mockApi, ok, renderRoutes, signedInAs, users, type MockRequest } from './helpers';

function userBackend(initial: User[] = [users.admin, users.manager, users.contributor]) {
  const state = { users: [...initial], nextId: 1 };
  const handlers = {
    ...signedInAs(users.admin),
    'GET /users': () => ok({ users: state.users }),
    'POST /users': (req: MockRequest) => {
      const body = req.body as {
        email: string;
        name: string;
        role: User['role'];
        managerId?: string;
      };
      const created: User = {
        id: `new${state.nextId++}`,
        email: body.email,
        name: body.name,
        role: body.role,
        managerId: body.managerId ?? null,
        isActive: true,
      };
      state.users.push(created);
      return ok({ user: created }, 201);
    },
  };
  return { state, handlers };
}

const open = async (backend = userBackend(), extra = {}) => {
  const api = mockApi({ ...backend.handlers, ...extra });
  renderRoutes('/users');
  await screen.findByRole('heading', { name: 'Users' });
  return api;
};
const form = () => within(screen.getByRole('form', { name: 'New user' }));

describe('user administration (admin)', () => {
  it('is not shown to anyone else, and makes no API call', async () => {
    for (const user of [users.contributor, users.manager]) {
      const api = mockApi(signedInAs(user));
      const view = renderRoutes('/users');

      expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
      expect(api.calls('GET /users')).toHaveLength(0);
      view.unmount();
    }
  });

  it('lists users with role and manager name', async () => {
    await open();

    const row = (await screen.findByText('dev@example.com')).closest('tr')!;
    expect(within(row).getByText('Casey Contributor')).toBeInTheDocument();
    expect(within(row).getByText('Contributor')).toBeInTheDocument();
    expect(within(row).getByText('Morgan Manager')).toBeInTheDocument();
  });

  it('creates a contributor under a chosen manager and shows them in the list', async () => {
    const api = await open();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'New user' }));
    await user.type(form().getByLabelText('Full name'), 'Eli Newcomer');
    await user.type(form().getByLabelText('Email'), 'eli@example.com');
    await user.selectOptions(form().getByLabelText('Manager'), 'u-mgr');
    await user.type(form().getByLabelText('Initial password'), 'Long-Enough-Pass-1');
    await user.click(form().getByRole('button', { name: 'Create user' }));

    expect(await screen.findByText('eli@example.com')).toBeInTheDocument();
    expect(api.calls('POST /users')[0]!.body).toEqual({
      name: 'Eli Newcomer',
      email: 'eli@example.com',
      role: 'CONTRIBUTOR',
      password: 'Long-Enough-Pass-1',
      managerId: 'u-mgr',
    });
    expect(screen.queryByRole('form', { name: 'New user' })).not.toBeInTheDocument();
  });

  it('creates a manager without asking for a manager', async () => {
    const api = await open();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'New user' }));
    await user.selectOptions(form().getByLabelText('Role'), 'MANAGER');
    expect(form().queryByLabelText('Manager')).not.toBeInTheDocument();
    await user.type(form().getByLabelText('Full name'), 'Sam Lead');
    await user.type(form().getByLabelText('Email'), 'sam@example.com');
    await user.type(form().getByLabelText('Initial password'), 'Long-Enough-Pass-1');
    await user.click(form().getByRole('button', { name: 'Create user' }));

    expect(await screen.findByText('sam@example.com')).toBeInTheDocument();
    const sent = api.calls('POST /users')[0]!.body as Record<string, unknown>;
    expect(sent['role']).toBe('MANAGER');
    expect(sent).not.toHaveProperty('managerId');
  });

  it('validates before sending: short password, missing manager, bad email', async () => {
    const api = await open();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'New user' }));
    await user.type(form().getByLabelText('Email'), 'nope');
    await user.type(form().getByLabelText('Initial password'), 'short');
    await user.click(form().getByRole('button', { name: 'Create user' }));

    expect(await screen.findByText('Enter the full name')).toBeInTheDocument();
    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument();
    expect(screen.getByText('Use at least 12 characters')).toBeInTheDocument();
    expect(screen.getByText('Choose a manager')).toBeInTheDocument();
    expect(api.calls('POST /users')).toHaveLength(0);
  });

  it('shows the server message for a duplicate email and keeps the form open', async () => {
    const backend = userBackend();
    await open(backend, {
      'POST /users': fail(409, 'CONFLICT', 'A user with this email already exists'),
    });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'New user' }));
    await user.type(form().getByLabelText('Full name'), 'Dup');
    await user.type(form().getByLabelText('Email'), 'dev@example.com');
    await user.selectOptions(form().getByLabelText('Manager'), 'u-mgr');
    await user.type(form().getByLabelText('Initial password'), 'Long-Enough-Pass-1');
    await user.click(form().getByRole('button', { name: 'Create user' }));

    expect(await screen.findByText('A user with this email already exists')).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'New user' })).toBeInTheDocument();
  });
});
