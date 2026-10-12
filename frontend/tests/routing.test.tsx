import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { routes } from '../src/routes';
import { dbUp, healthOk, mockApi, renderRoutes, signedInAs, users } from './helpers';

describe('routing', () => {
  it('renders the home page for a signed-in user', async () => {
    mockApi(signedInAs(users.contributor));

    renderRoutes('/');

    expect(
      await screen.findByRole('heading', { level: 1, name: /Welcome, Casey Contributor/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
  });

  it('renders the status page at /status', async () => {
    mockApi({ 'GET /health': healthOk(), 'GET /health/db': dbUp() });

    renderRoutes('/status');

    expect(screen.getByRole('heading', { level: 1, name: 'System status' })).toBeInTheDocument();
    expect(await screen.findByText('Operational')).toBeInTheDocument();
  });

  it('renders a not-found page for unknown URLs inside the layout', async () => {
    mockApi();

    renderRoutes('/definitely/not/here');

    expect(await screen.findByText('Page not found')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
  });

  it('navigates with the nav links and marks the active one', async () => {
    mockApi({
      ...signedInAs(users.contributor),
      'GET /health': healthOk(),
      'GET /health/db': dbUp(),
    });
    const { router } = renderRoutes('/');
    expect(await screen.findByRole('link', { name: 'Home' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await userEvent.click(screen.getByRole('link', { name: 'System status' }));

    expect(router.state.location.pathname).toBe('/status');
    expect(screen.getByRole('link', { name: 'System status' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
  });

  it('offers a skip link and a main landmark', async () => {
    mockApi({ 'GET /health': healthOk(), 'GET /health/db': dbUp() });
    renderRoutes('/status');
    await screen.findByRole('heading', { name: 'System status' });

    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
  });

  it('shows the route error page (not a blank screen) when a page crashes while rendering', () => {
    mockApi();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const Boom = () => {
      throw new Error('render failure with internal detail');
    };

    // Use the REAL route table (so its errorElement is what is under test) plus one crashing page.
    const [root] = routes;
    if (!root || root.index) throw new Error('expected a non-index root route');
    renderRoutes('/boom', [
      { ...root, children: [...(root.children ?? []), { path: 'boom', element: <Boom /> }] },
    ]);

    expect(screen.getByRole('alert')).toHaveTextContent('This page crashed');
    expect(screen.getByRole('alert')).not.toHaveTextContent('internal detail');
    expect(screen.getByRole('link', { name: 'Back to home' })).toBeInTheDocument();
  });
});
