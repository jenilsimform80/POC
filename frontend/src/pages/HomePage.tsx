import { Link } from 'react-router';
import { canAccess } from '../auth/access';
import { useCurrentUser } from '../auth/useAuth';

export function HomePage() {
  const user = useCurrentUser();

  return (
    <>
      <h1>Welcome, {user.name}</h1>
      <p className="muted">
        Log hours against projects, submit your weekly timesheet, and see where the hours go.
      </p>
      <ul>
        <li>
          <Link to="/timesheet">Log and submit your timesheet</Link>
        </li>
        {canAccess(user.role, 'approvals') && (
          <li>
            <Link to="/approvals">Review timesheets from your team</Link>
          </li>
        )}
        <li>
          <Link to="/projects">Browse projects</Link>
        </li>
        <li>
          <Link to="/reports">Hours reports</Link>
        </li>
        {canAccess(user.role, 'budgets') && (
          <li>
            <Link to="/reports/budgets">Project budgets</Link>
          </li>
        )}
        {canAccess(user.role, 'periods') && (
          <li>
            <Link to="/periods">Lock or unlock billing periods</Link>
          </li>
        )}
      </ul>
    </>
  );
}
