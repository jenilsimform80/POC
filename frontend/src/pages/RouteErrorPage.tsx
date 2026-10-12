import { Link, useRouteError } from 'react-router';
import { ErrorState } from '../components/ui/ErrorState';
import styles from './RouteErrorPage.module.css';

/** Shown when a route throws while rendering (last line of defence; not for API errors). */
export function RouteErrorPage() {
  const error = useRouteError();
  return (
    <main className={styles.page}>
      <ErrorState title="This page crashed" error={error instanceof Error ? error : undefined} />
      <p>
        <Link to="/">Back to home</Link>
      </p>
    </main>
  );
}
