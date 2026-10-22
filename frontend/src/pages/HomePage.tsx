import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { canAccess, type Area } from '../auth/access';
import { useCurrentUser } from '../auth/useAuth';
import {
  ChartIcon,
  CheckIcon,
  ClockIcon,
  FolderIcon,
  LockIcon,
  WalletIcon,
} from '../components/layout/icons';
import { formatDay, todayIso } from '../lib/dates';
import { Dashboard } from '../features/dashboard/Dashboard';
import styles from './HomePage.module.css';

interface Shortcut {
  to: string;
  title: string;
  description: string;
  icon: ReactNode;
  area?: Area;
}

const SHORTCUTS: Shortcut[] = [
  {
    to: '/timesheet',
    title: 'Log and submit your timesheet',
    description: 'Record hours per day and send the week for approval.',
    icon: <ClockIcon />,
  },
  {
    to: '/approvals',
    title: 'Review timesheets from your team',
    description: 'Approve or reject weeks your team has submitted.',
    icon: <CheckIcon />,
    area: 'approvals',
  },
  {
    to: '/projects',
    title: 'Browse projects',
    description: 'See projects, tasks and who they bill to.',
    icon: <FolderIcon />,
  },
  {
    to: '/reports',
    title: 'Hours reports',
    description: 'Break hours down by person, project and month.',
    icon: <ChartIcon />,
  },
  {
    to: '/reports/budgets',
    title: 'Project budgets',
    description: 'Track budget usage against billed hours.',
    icon: <WalletIcon />,
    area: 'budgets',
  },
  {
    to: '/periods',
    title: 'Lock or unlock billing periods',
    description: 'Freeze a month so its hours can no longer change.',
    icon: <LockIcon />,
    area: 'periods',
  },
];

export function HomePage() {
  const user = useCurrentUser();

  return (
    <>
      <div className={styles.hero}>
        <div>
          <p className={styles.date}>{formatDay(todayIso())}</p>
          <h1>Welcome, {user.name}</h1>
          <p className="muted">
            Log hours against projects, submit your weekly timesheet, and see where the hours go.
          </p>
        </div>
        <div className={styles.heroActions}>
          <Link to="/timesheet" className={styles.primaryLink}>
            Log hours
          </Link>
          {canAccess(user.role, 'approvals') && (
            <Link to="/approvals" className={styles.secondaryLink}>
              Review approvals
            </Link>
          )}
        </div>
      </div>
      <Dashboard />
      <h2 className={styles.quickLinks}>Quick links</h2>
      <ul className={styles.grid}>
        {SHORTCUTS.filter((s) => !s.area || canAccess(user.role, s.area)).map((s) => (
          <li key={s.to}>
            <Link to={s.to} className={styles.card}>
              <span className={styles.icon}>{s.icon}</span>
              <span>
                <span className={styles.title}>{s.title}</span>
                <span className={styles.desc}>{s.description}</span>
              </span>
              <span className={styles.arrow} aria-hidden="true">
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
