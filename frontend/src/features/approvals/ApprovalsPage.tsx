import { useCallback, useState } from 'react';
import { Link } from 'react-router';
import { listSubmissions } from '../../api/submissions';
import { listDirectReports } from '../../api/users';
import type { SubmissionStatus } from '../../api/types';
import { AsyncView } from '../../components/ui/AsyncView';
import { EmptyState } from '../../components/ui/EmptyState';
import { SelectField } from '../../components/ui/FormControls';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { combineAsync } from '../../hooks/combineAsync';
import { useAsync } from '../../hooks/useAsync';
import { addDays, formatRange, formatTimestamp } from '../../lib/dates';

const FILTERS: { value: SubmissionStatus; label: string }[] = [
  { value: 'SUBMITTED', label: 'Waiting for my decision' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
];

export function ApprovalsPage() {
  const [status, setStatus] = useState<SubmissionStatus>('SUBMITTED');
  const loadSubmissions = useCallback(
    (signal: AbortSignal) => listSubmissions({ forApproval: true, status }, signal),
    [status],
  );
  const loadReports = useCallback((signal: AbortSignal) => listDirectReports(signal), []);
  const submissions = useAsync(loadSubmissions);
  const reports = useAsync(loadReports);
  const state = combineAsync({ submissions: submissions.state, reports: reports.state });

  return (
    <>
      <h1>Approvals</h1>
      <div className="row">
        <SelectField
          label="Show"
          value={status}
          onChange={(e) => setStatus(e.target.value as SubmissionStatus)}
        >
          {FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </SelectField>
      </div>

      <AsyncView
        state={state}
        onRetry={() => {
          submissions.reload();
          reports.reload();
        }}
        loadingLabel="Loading timesheets…"
        errorTitle="Could not load timesheets"
        isEmpty={(data) => data.submissions.length === 0}
        empty={
          <EmptyState
            title={status === 'SUBMITTED' ? 'Nothing is waiting for you' : 'No timesheets here'}
            description={
              status === 'SUBMITTED'
                ? 'When someone on your team submits a week, it will show up here.'
                : 'Timesheets you have decided will be listed here.'
            }
          />
        }
      >
        {({ submissions: items, reports: team }) => {
          const nameOf = (id: string) => team.find((u) => u.id === id)?.name ?? 'Team member';
          return (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Person</th>
                    <th>Week</th>
                    <th>Submitted</th>
                    <th>Status</th>
                    <th>
                      <span className="visually-hidden">Action</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((s) => (
                    <tr key={s.id}>
                      <td>{nameOf(s.userId)}</td>
                      <td>{formatRange(s.weekStart, addDays(s.weekStart, 6))}</td>
                      <td>{formatTimestamp(s.submittedAt)}</td>
                      <td>
                        <StatusBadge status={s.status} />
                      </td>
                      <td>
                        <Link
                          to={`/approvals/${s.id}`}
                          aria-label={`Review ${nameOf(s.userId)} ${formatRange(s.weekStart, addDays(s.weekStart, 6))}`}
                        >
                          {s.status === 'SUBMITTED' ? 'Review' : 'View'}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }}
      </AsyncView>
    </>
  );
}
