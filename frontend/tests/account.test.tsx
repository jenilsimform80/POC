import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  fail,
  mockApi,
  noContent,
  renderRoutes,
  signedInAs,
  tokenResponse,
  users,
} from './helpers';

const fill = async (current: string, next: string, confirm: string) => {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Current password'), current);
  await user.type(screen.getByLabelText('New password'), next);
  await user.type(screen.getByLabelText('Confirm new password'), confirm);
  await user.click(screen.getByRole('button', { name: 'Change password' }));
};

describe('account: change password', () => {
  it.each([users.contributor, users.manager, users.admin])('is available to $role', async (who) => {
    mockApi(signedInAs(who));
    renderRoutes('/account');

    expect(await screen.findByRole('heading', { name: 'Account' })).toBeInTheDocument();
    expect(screen.getByText(who.email)).toBeInTheDocument();
  });

  it('changes the password and clears the form', async () => {
    const api = mockApi({
      ...signedInAs(users.contributor),
      'POST /auth/change-password': noContent(),
    });
    renderRoutes('/account');
    await screen.findByRole('heading', { name: 'Account' });

    await fill('Old-Password-123', 'New-Password-456', 'New-Password-456');

    expect(await screen.findByText('Your password was changed.')).toBeInTheDocument();
    expect(api.calls('POST /auth/change-password')[0]!.body).toEqual({
      currentPassword: 'Old-Password-123',
      newPassword: 'New-Password-456',
    });
    expect(screen.getByLabelText('Current password')).toHaveValue('');
  });

  it('validates locally: short password and mismatch send nothing', async () => {
    const api = mockApi(signedInAs(users.contributor));
    renderRoutes('/account');
    await screen.findByRole('heading', { name: 'Account' });

    await fill('Old-Password-123', 'short', 'short');
    expect(await screen.findByText('Use at least 8 characters')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.clear(screen.getByLabelText('New password'));
    await user.type(screen.getByLabelText('New password'), 'New-Password-456');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText('The passwords do not match')).toBeInTheDocument();
    expect(api.calls('POST /auth/change-password')).toHaveLength(0);
  });

  it('shows a wrong current password on the form WITHOUT signing the user out', async () => {
    mockApi({
      ...signedInAs(users.contributor),
      'POST /auth/change-password': fail(401, 'UNAUTHENTICATED', 'Current password is incorrect'),
      // a 401 here first tries a silent token refresh; it works, so the 401 really was the password
      'POST /auth/refresh': tokenResponse(users.contributor, '2'),
    });
    renderRoutes('/account');
    await screen.findByRole('heading', { name: 'Account' });

    await fill('Wrong-Password-1', 'New-Password-456', 'New-Password-456');

    expect(await screen.findByText('Current password is incorrect')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Account' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument();
  });

  it('reveals each of the three password fields independently', async () => {
    mockApi(signedInAs(users.contributor));
    renderRoutes('/account');
    await screen.findByRole('heading', { name: 'Account' });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Show new password' }));

    expect(screen.getByLabelText('New password')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('Current password')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('Confirm new password')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Show current password' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show confirm new password' })).toBeInTheDocument();
  });
});
