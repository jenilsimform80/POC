import { Navigate, Outlet, useLocation } from 'react-router';
import { LoadingState } from '../components/ui/LoadingState';
import { useAuth } from './useAuth';

/** Route guard: signed-in users only. Anonymous users go to /login and return afterwards. */
export function RequireAuth() {
  const { state } = useAuth();
  const location = useLocation();

  if (state.status === 'loading') return <LoadingState label="Checking your session…" />;
  if (state.status === 'anonymous') {
    return (
      <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />
    );
  }
  return <Outlet />;
}
