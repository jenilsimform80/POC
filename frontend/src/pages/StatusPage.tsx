import { getDatabaseHealth, getHealth } from '../api/health';
import { AsyncView } from '../components/ui/AsyncView';
import { Button } from '../components/ui/Button';
import { useAsync } from '../hooks/useAsync';
import styles from './StatusPage.module.css';

/** Proves the browser → Vite proxy / reverse proxy → API → database chain works end to end. */
export function StatusPage() {
  const api = useAsync(getHealth);
  const database = useAsync(getDatabaseHealth);

  const refresh = () => {
    api.reload();
    database.reload();
  };

  return (
    <>
      <h1>System status</h1>
      <div className={styles.grid}>
        <section aria-labelledby="api-heading" className={styles.card}>
          <h2 id="api-heading">API</h2>
          <AsyncView
            state={api.state}
            onRetry={api.reload}
            loadingLabel="Checking the API…"
            errorTitle="API unreachable"
          >
            {(health) => (
              <p>
                <span className={styles.ok}>Operational</span> · up {health.uptimeSeconds}s
              </p>
            )}
          </AsyncView>
        </section>
        <section aria-labelledby="db-heading" className={styles.card}>
          <h2 id="db-heading">Database</h2>
          <AsyncView
            state={database.state}
            onRetry={database.reload}
            loadingLabel="Checking the database…"
            errorTitle="Database status unavailable"
          >
            {(health) =>
              health.database === 'up' ? (
                <p>
                  <span className={styles.ok}>Connected</span>
                </p>
              ) : (
                <p>
                  <span className={styles.bad}>Unavailable</span> · the API cannot reach the
                  database
                </p>
              )
            }
          </AsyncView>
        </section>
      </div>
      <Button variant="secondary" onClick={refresh}>
        Refresh
      </Button>
    </>
  );
}
