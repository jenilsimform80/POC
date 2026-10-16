import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { User } from '../src/api/types';
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

const secondManager: User = {
  id: 'u-mgr2',
  email: 'other.manager@example.com',
  name: 'Olive Manager',
  role: 'MANAGER',
  managerId: null,
  isActive: true,
};

function userBackend(
  initial: User[] = [users.admin, users.manager, secondManager, users.contributor],
) {
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
    'PATCH /users/:id': (req: MockRequest) => {
      const i = state.users.findIndex((u) => u.id === req.params['id']);
      state.users[i] = { ...state.users[i]!, ...(req.body as Partial<User>) };
      return ok({ user: state.users[i] });
    },
    'POST /users/:id/password': () => noContent(),
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

  it('can reveal the initial password while typing it', async () => {
    await open();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'New user' }));
    const field = form().getByLabelText('Initial password');
    await user.type(field, 'Long-Enough-Pass-1');
    expect(field).toHaveAttribute('type', 'password');

    await user.click(form().getByRole('button', { name: 'Show initial password' }));

    expect(field).toHaveAttribute('type', 'text');
    expect(field).toHaveValue('Long-Enough-Pass-1');
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
    expect(screen.getByText('Use at least 8 characters')).toBeInTheDocument();
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

describe('user management (admin)', () => {
  const rowOf = async (email: string) => (await screen.findByText(email)).closest('tr')!;
  type User = ReturnType<typeof userEvent.setup>;
  const trigger = (email: string) => screen.findByRole('button', { name: `Actions for ${email}` });
  /** Opens a row's three-dot menu and clicks one of its items. */
  const choose = async (user: User, email: string, item: string) => {
    await user.click(await trigger(email));
    await user.click(await screen.findByRole('menuitem', { name: item }));
  };
  /** Opens a row's menu, returns the item names, and closes it again. */
  const itemsOf = async (user: User, email: string) => {
    await user.click(await trigger(email));
    const names = (await screen.findAllByRole('menuitem')).map((el) => el.textContent);
    await user.keyboard('{Escape}');
    return names;
  };

  it('offers no actions for admin accounts', async () => {
    await open();

    const row = await rowOf('admin@example.com');
    expect(within(row).queryByRole('button')).not.toBeInTheDocument();
  });

  it('keeps every row action inside one three-dot menu', async () => {
    await open();
    const user = userEvent.setup();

    // Nothing but the trigger is visible until it is clicked.
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit dev@example.com' })).not.toBeInTheDocument();
    expect(await itemsOf(user, 'dev@example.com')).toEqual([
      'Edit',
      'Reset password',
      'Deactivate',
    ]);
  });

  it('edits a contributor: sends only what changed and refreshes the list', async () => {
    const api = await open();
    const user = userEvent.setup();

    await choose(user, 'dev@example.com', 'Edit');
    const form = within(screen.getByRole('form', { name: 'Edit dev@example.com' }));
    await user.clear(form.getByLabelText('Full name'));
    await user.type(form.getByLabelText('Full name'), 'Casey Renamed');
    await user.click(form.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Casey Renamed')).toBeInTheDocument();
    expect(api.calls('PATCH /users/:id')[0]!.body).toEqual({ name: 'Casey Renamed' });
  });

  it('promotes to manager without sending a manager', async () => {
    const api = await open();
    const user = userEvent.setup();

    await choose(user, 'dev@example.com', 'Edit');
    const form = within(screen.getByRole('form', { name: 'Edit dev@example.com' }));
    await user.selectOptions(form.getByLabelText('Role'), 'MANAGER');
    expect(form.queryByLabelText('Manager')).not.toBeInTheDocument();
    await user.click(form.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(screen.queryByRole('form', { name: 'Edit dev@example.com' })).not.toBeInTheDocument(),
    );
    expect(api.calls('PATCH /users/:id')[0]!.body).toEqual({ role: 'MANAGER' });
  });

  it('shows the server reason when an edit is refused and keeps the form open', async () => {
    await open(userBackend(), {
      'PATCH /users/:id': fail(
        422,
        'BUSINESS_RULE_VIOLATION',
        'This manager still has 2 active direct report(s).',
      ),
    });
    const user = userEvent.setup();

    await choose(user, 'manager@example.com', 'Edit');
    const form = within(screen.getByRole('form', { name: 'Edit manager@example.com' }));
    await user.selectOptions(form.getByLabelText('Role'), 'CONTRIBUTOR');
    await user.selectOptions(form.getByLabelText('Manager'), 'u-mgr2');
    await user.click(form.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText(/still has 2 active direct report/)).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'Edit manager@example.com' })).toBeInTheDocument();
  });

  it('deactivates and reactivates a user', async () => {
    const api = await open();
    const user = userEvent.setup();

    await choose(user, 'dev@example.com', 'Deactivate');
    expect(within(await rowOf('dev@example.com')).getByText('Inactive')).toBeInTheDocument();
    expect(api.calls('PATCH /users/:id')[0]!.body).toEqual({ isActive: false });
    expect(await itemsOf(user, 'dev@example.com')).toEqual([
      'Edit',
      'Reset password',
      'Reactivate',
    ]);

    await choose(user, 'dev@example.com', 'Reactivate');
    await waitFor(async () =>
      expect(within(await rowOf('dev@example.com')).getByText('Active')).toBeInTheDocument(),
    );
    expect(api.calls('PATCH /users/:id')[1]!.body).toEqual({ isActive: true });
  });

  it('shows why a deactivation was refused', async () => {
    await open(userBackend(), {
      'PATCH /users/:id': fail(422, 'BUSINESS_RULE_VIOLATION', 'Reassign the reports first.'),
    });
    const user = userEvent.setup();

    await choose(user, 'manager@example.com', 'Deactivate');

    expect(await screen.findByText('Reassign the reports first.')).toBeInTheDocument();
    expect(await itemsOf(user, 'manager@example.com')).toContain('Deactivate');
  });

  it('can reveal the new password in the reset form', async () => {
    await open();
    const user = userEvent.setup();

    await choose(user, 'dev@example.com', 'Reset password');
    const reset = within(screen.getByRole('form', { name: 'Reset password for dev@example.com' }));
    await user.type(reset.getByLabelText('New password'), 'A-Much-Longer-Pass-1');
    await user.click(reset.getByRole('button', { name: 'Show new password' }));

    expect(reset.getByLabelText('New password')).toHaveAttribute('type', 'text');
  });

  it('resets a password, validating the length first', async () => {
    const api = await open();
    const user = userEvent.setup();

    await choose(user, 'dev@example.com', 'Reset password');
    const form = () =>
      within(screen.getByRole('form', { name: 'Reset password for dev@example.com' }));
    await user.type(form().getByLabelText('New password'), 'short');
    await user.click(form().getByRole('button', { name: 'Set password' }));
    expect(await screen.findByText('Use at least 8 characters')).toBeInTheDocument();
    expect(api.calls('POST /users/:id/password')).toHaveLength(0);

    await user.clear(form().getByLabelText('New password'));
    await user.type(form().getByLabelText('New password'), 'A-Much-Longer-Pass-1');
    await user.click(form().getByRole('button', { name: 'Set password' }));

    await waitFor(() =>
      expect(screen.queryByRole('form', { name: /Reset password/ })).not.toBeInTheDocument(),
    );
    expect(api.calls('POST /users/:id/password')[0]!.body).toEqual({
      password: 'A-Much-Longer-Pass-1',
    });
  });
});
