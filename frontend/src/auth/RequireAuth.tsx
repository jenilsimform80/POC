import { Navigate, Outlet, useLocation } from 'react-router';
import { LoadingState } from '../components/ui/LoadingState';
import { useAuth } from './useAuth';

/**
 * Route guard: signed-in users only. Anonymous visitors go to /login and, after signing in, return
 * to the page they wanted (a bookmark, or a session that expired). After an explicit Sign out
 * nothing is remembered, so the next sign-in always lands on the dashboard.
 */
export function RequireAuth() {
  const { state } = useAuth();
  const location = useLocation();

  if (state.status === 'loading') return <LoadingState label="Checking your session…" />;
  if (state.status === 'anonymous') {
    const from = state.signedOut ? undefined : `${location.pathname}${location.search}`;
    return <Navigate to="/login" replace state={from === undefined ? null : { from }} />;
  }
  // An admin reset this password: the only usable page is Account until it is changed. (The
  // backend refuses every other request too; this just keeps the user from seeing errors.)
  if (state.user.mustChangePassword && location.pathname !== '/account') {
    return <Navigate to="/account" replace />;
  }
  return <Outlet />;
}
