import { useCallback } from 'react';
import { listSubmissions } from '../../api/submissions';
import { AsyncView } from '../../components/ui/AsyncView';
import { EmptyState } from '../../components/ui/EmptyState';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useAsync } from '../../hooks/useAsync';
import { addDays, formatRange, formatTimestamp } from '../../lib/dates';
import { Link } from 'react-router';

/** Own past submissions (week, status) with a link to open each week. `reloadKey` forces a refresh. */
export function SubmissionHistory({ reloadKey }: { reloadKey: string }) {
  const load = useCallback(
    (signal: AbortSignal) => {
      void reloadKey; // a new key (e.g. after submitting) creates a new loader and refetches
      return listSubmissions({}, signal);
    },
    [reloadKey],
  );
  const { state, reload } = useAsync(load);

  return (
    <section aria-labelledby="history-heading">
      <h2 id="history-heading">Submission history</h2>
      <AsyncView
        state={state}
        onRetry={reload}
        loadingLabel="Loading your submissions…"
        errorTitle="Could not load your submissions"
        isEmpty={(items) => items.length === 0}
        empty={
          <EmptyState
            title="No submissions yet"
            description="Weeks you submit for approval will be listed here."
          />
        }
      >
        {(items) => (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Week</th>
                  <th>Status</th>
                  <th>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {items.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <Link to={`/timesheet?week=${s.weekStart}`}>
                        {formatRange(s.weekStart, addDays(s.weekStart, 6))}
                      </Link>
                    </td>
                    <td>
                      <StatusBadge status={s.status} />
                    </td>
                    <td>{formatTimestamp(s.submittedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AsyncView>
    </section>
  );
}
