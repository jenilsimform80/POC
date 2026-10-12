import { screen, waitFor, within } from '@testing-library/react';
import { useEffect, useState } from 'react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiRequest } from '../src/api/client';
import { RequireAuth } from '../src/auth/RequireAuth';
import { LoginPage } from '../src/pages/LoginPage';
import { routes } from '../src/routes';
import { safeReturnPath } from '../src/lib/navigation';
import {
  dbUp,
  fail,
  healthOk,
  mockApi,
  noContent,
  ok,
  renderRoutes,
  signedInAs,
  users,
} from './helpers';

const nav = () => within(screen.getByRole('navigation', { name: 'Main' }));
const linkNames = () =>
  nav()
    .getAllByRole('link')
    .map((l) => l.textContent);

describe('session bootstrap and route guards', () => {
  it('shows a loading state while the session is being checked, then the page', async () => {
    mockApi(signedInAs(users.contributor));

    renderRoutes('/');

    expect(screen.getByRole('status')).toHaveTextContent('Checking your session…');
    expect(
      await screen.findByRole('heading', { name: /Welcome, Casey Contributor/ }),
    ).toBeInTheDocument();
  });

  it('redirects an anonymous visitor to /login and remembers where they wanted to go', async () => {
    mockApi(); // /auth/me -> 401

    const { router } = renderRoutes('/');

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.state).toEqual({ from: '/' });
  });

  it('treats a failing session check as signed out (never a blank screen)', async () => {
    mockApi({ 'GET /auth/me': fail(500, 'INTERNAL_ERROR', 'An unexpected error occurred') });

    renderRoutes('/');

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('keeps the public status page reachable without signing in', async () => {
    mockApi({ 'GET /health': healthOk(), 'GET /health/db': dbUp() });

    renderRoutes('/status');

    expect(await screen.findByText('Operational')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
  });
});

describe('login', () => {
  it('signs in, sends the credentials once, and lands on the home page', async () => {
    const api = mockApi({ 'POST /auth/login': ok({ user: users.contributor }) });
    renderRoutes('/login');
    await screen.findByRole('heading', { name: 'Sign in' });

    await userEvent.type(screen.getByLabelText('Email'), '  dev@example.com ');
    await userEvent.type(screen.getByLabelText('Password'), 'S3cret-pass');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(
      await screen.findByRole('heading', { name: /Welcome, Casey Contributor/ }),
    ).toBeInTheDocument();
    expect(api.calls('POST /auth/login')).toHaveLength(1);
    expect(api.calls('POST /auth/login')[0]?.body).toEqual({
      email: 'dev@example.com',
      password: 'S3cret-pass',
    });
    expect(within(screen.getByRole('banner')).getByText(/Casey Contributor/)).toBeInTheDocument();
  });

  it('returns to the page the user originally asked for', async () => {
    mockApi({
      'POST /auth/login': ok({ user: users.manager }),
      'GET /health': healthOk(),
      'GET /health/db': dbUp(),
    });
    const { router } = renderRoutes('/login');
    await router.navigate('/login', { state: { from: '/status?x=1' } });
    await screen.findByRole('heading', { name: 'Sign in' });

    await userEvent.type(screen.getByLabelText('Email'), 'manager@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'pw');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/status'));
    expect(router.state.location.search).toBe('?x=1');
  });

  it('validates required fields on the client without calling the API', async () => {
    const api = mockApi();
    renderRoutes('/login');
    await screen.findByRole('heading', { name: 'Sign in' });

    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(screen.getByText('Enter your email')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
    expect(api.calls('POST /auth/login')).toHaveLength(0);
  });

  it('shows the generic backend message for wrong credentials and stays on the form', async () => {
    mockApi({ 'POST /auth/login': fail(401, 'UNAUTHENTICATED', 'Invalid email or password') });
    const { router } = renderRoutes('/login');
    await screen.findByRole('heading', { name: 'Sign in' });

    await userEvent.type(screen.getByLabelText('Email'), 'dev@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    expect(router.state.location.pathname).toBe('/login');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  it('explains throttling (429) and disables the button while signing in', async () => {
    let release!: () => void;
    mockApi({
      'POST /auth/login': () =>
        new Promise((resolve) => {
          release = () =>
            resolve(fail(429, 'RATE_LIMITED', 'Too many failed login attempts. Try again later.'));
        }),
    });
    renderRoutes('/login');
    await screen.findByRole('heading', { name: 'Sign in' });
    await userEvent.type(screen.getByLabelText('Email'), 'dev@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'x');

    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByRole('button', { name: 'Signing in…' })).toBeDisabled();
    release();

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many failed login attempts');
  });

  it('does not show the login form to someone who is already signed in', async () => {
    mockApi(signedInAs(users.admin));

    renderRoutes('/login');

    expect(await screen.findByRole('heading', { name: /Welcome, Alex Admin/ })).toBeInTheDocument();
  });
});

describe('safeReturnPath', () => {
  it('accepts in-app paths only', () => {
    expect(safeReturnPath('/projects?x=1')).toBe('/projects?x=1');
    expect(safeReturnPath('https://evil.test/')).toBe('/');
    expect(safeReturnPath('//evil.test')).toBe('/');
    expect(safeReturnPath('/login')).toBe('/');
    expect(safeReturnPath(undefined)).toBe('/');
    expect(safeReturnPath(42)).toBe('/');
  });
});

describe('role-aware navigation (a convenience; the backend enforces access)', () => {
  it.each([
    [
      'contributor',
      users.contributor,
      ['Home', 'Timesheet', 'Projects', 'Reports', 'System status'],
    ],
    [
      'manager',
      users.manager,
      ['Home', 'Timesheet', 'Approvals', 'Projects', 'Reports', 'System status'],
    ],
    [
      'admin',
      users.admin,
      ['Home', 'Timesheet', 'Projects', 'Reports', 'Budgets', 'Locked periods', 'System status'],
    ],
  ])('shows the right links for a %s', async (_label, user, expected) => {
    mockApi(signedInAs(user));

    renderRoutes('/');
    await screen.findByRole('heading', { name: /Welcome/ });

    expect(linkNames()).toEqual(expected);
  });
});

describe('sign out and expired sessions', () => {
  it('signs out: calls the API, clears the user and goes back to the login page', async () => {
    const api = mockApi({ ...signedInAs(users.contributor), 'POST /auth/logout': noContent() });
    renderRoutes('/');
    await screen.findByRole('heading', { name: /Welcome/ });

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(api.calls('POST /auth/logout')).toHaveLength(1);
    expect(screen.queryByText('Casey Contributor')).not.toBeInTheDocument();
  });

  it('stays signed in and says so when the server could not end the session', async () => {
    mockApi({
      ...signedInAs(users.contributor),
      'POST /auth/logout': fail(500, 'INTERNAL_ERROR', 'An unexpected error occurred'),
    });
    renderRoutes('/');
    await screen.findByRole('heading', { name: /Welcome/ });

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not sign out');
    expect(screen.getByRole('alert')).toHaveTextContent('You are still signed in');
    expect(screen.getByRole('heading', { name: /Welcome/ })).toBeInTheDocument();
  });

  it('a 401 from any later API call drops the user to the login page (central handler)', async () => {
    // A protected page that makes an API call on mount; the session has silently expired.
    function Probe() {
      const [done, setDone] = useState(false);
      useEffect(() => {
        apiRequest('/projects').catch(() => setDone(true));
      }, []);
      return <p>{done ? 'request failed' : 'requesting'}</p>;
    }
    mockApi({
      ...signedInAs(users.contributor),
      'GET /projects': fail(401, 'UNAUTHENTICATED', 'Authentication required'),
    });
    const [root] = routes;
    if (!root || root.index) throw new Error('expected a non-index root route');
    const { router } = renderRoutes('/guarded', [
      {
        ...root,
        children: [
          { path: 'login', element: <LoginPage /> },
          { element: <RequireAuth />, children: [{ path: 'guarded', element: <Probe /> }] },
        ],
      },
    ]);

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.state).toEqual({ from: '/guarded' });
  });
});
