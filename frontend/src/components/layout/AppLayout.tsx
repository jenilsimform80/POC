import { NavLink, Outlet } from 'react-router';
import { canAccess, type Area } from '../../auth/access';
import { useAuth } from '../../auth/useAuth';
import { useMutation } from '../../hooks/useMutation';
import { Alert } from '../ui/Alert';
import { describeError } from '../ui/describeError';
import { Button } from '../ui/Button';
import styles from './AppLayout.module.css';

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
  area?: Area;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Home', end: true },
  { to: '/timesheet', label: 'Timesheet', area: 'timesheet' },
  { to: '/approvals', label: 'Approvals', area: 'approvals' },
  { to: '/projects', label: 'Projects', area: 'projects' },
  { to: '/reports', label: 'Reports', area: 'reports', end: true },
  { to: '/reports/budgets', label: 'Budgets', area: 'budgets' },
  { to: '/periods', label: 'Locked periods', area: 'periods' },
];

const ROLE_LABEL = {
  CONTRIBUTOR: 'Contributor',
  MANAGER: 'Manager',
  ADMIN: 'Admin / Finance',
} as const;

export function AppLayout() {
  const { state, logout } = useAuth();
  const signOut = useMutation(logout);
  const user = state.status === 'authenticated' ? state.user : null;
  const items = user
    ? NAV_ITEMS.filter((item) => !item.area || canAccess(user.role, item.area))
    : [];

  return (
    <div className={styles.shell}>
      <a href="#main" className={styles.skipLink}>
        Skip to content
      </a>
      <header className={styles.header}>
        <span className={styles.brand}>Timesheets &amp; Billing</span>
        <nav aria-label="Main">
          <ul className={styles.nav}>
            {items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end ?? false}
                  className={({ isActive }) => (isActive ? styles.active : styles.link)}
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
            <li>
              <NavLink
                to="/status"
                className={({ isActive }) => (isActive ? styles.active : styles.link)}
              >
                System status
              </NavLink>
            </li>
          </ul>
        </nav>
        <div className={styles.account}>
          {user ? (
            <>
              <span>
                {user.name} <small className={styles.role}>({ROLE_LABEL[user.role]})</small>
              </span>
              <Button
                variant="secondary"
                disabled={signOut.running}
                onClick={() => void signOut.run()}
              >
                Sign out
              </Button>
            </>
          ) : state.status === 'anonymous' ? (
            <NavLink to="/login" className={styles.link}>
              Sign in
            </NavLink>
          ) : null}
        </div>
      </header>
      {signOut.error && (
        <div className={styles.banner}>
          <Alert variant="error" title="Could not sign out">
            {describeError(signOut.error)} You are still signed in.
          </Alert>
        </div>
      )}
      <main id="main" className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
