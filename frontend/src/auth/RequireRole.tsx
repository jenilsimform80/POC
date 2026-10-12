import { Outlet } from 'react-router';
import { EmptyState } from '../components/ui/EmptyState';
import { canAccess, type Area } from './access';
import { useCurrentUser } from './useAuth';

/** Convenience guard (not security): shows "no access" instead of a screen the API would reject. */
export function RequireRole({ area }: { area: Area }) {
  const user = useCurrentUser();
  if (!canAccess(user.role, area)) {
    return (
      <EmptyState
        title="You don't have access to this page"
        description="Your role does not include this area."
      />
    );
  }
  return <Outlet />;
}
