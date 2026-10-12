import { useCallback, useState } from 'react';
import { getBudgetReport } from '../../api/reports';
import type { BudgetProject, BudgetStatus } from '../../api/types';
import { AsyncView } from '../../components/ui/AsyncView';
import { Badge, type Tone } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { CheckboxField, TextField } from '../../components/ui/FormControls';
import { useAsync } from '../../hooks/useAsync';
import { isValidIsoDate } from '../../lib/dates';
import styles from './Budget.module.css';

const STATUS: Record<BudgetStatus, { label: string; tone: Tone }> = {
  OK: { label: 'On track', tone: 'success' },
  WARNING: { label: 'Nearly used', tone: 'warning' },
  OVER: { label: 'Over budget', tone: 'danger' },
};

export function BudgetReportPage() {
  const [includeArchived, setIncludeArchived] = useState(false);
  const [through, setThrough] = useState('');
  const validThrough = through === '' || isValidIsoDate(through) ? through : '';
  const load = useCallback(
    (signal: AbortSignal) =>
      getBudgetReport({ includeArchived, ...(validThrough && { through: validThrough }) }, signal),
    [includeArchived, validThrough],
  );
  const { state, reload } = useAsync(load);

  return (
    <>
      <h1>Project budgets</h1>
      <p className="muted">
        Logged hours against each project’s allocated hours. “Nearly used” starts at 80%; over 100%
        is flagged as over budget.
      </p>
      <div className="row">
        <TextField
          label="Hours up to (optional)"
          type="date"
          hint="Leave empty for all time, e.g. pick a month end for a snapshot."
          value={through}
          onChange={(e) => setThrough(e.target.value)}
        />
        <CheckboxField
          label="Include archived projects"
          checked={includeArchived}
          onChange={(e) => setIncludeArchived(e.target.checked)}
        />
      </div>

      <AsyncView
        state={state}
        onRetry={reload}
        loadingLabel="Calculating budgets…"
        errorTitle="Could not load the budget report"
        isEmpty={(data) => data.projects.length === 0}
        empty={<EmptyState title="No projects to report on" />}
      >
        {(data) => (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Project</th>
                  <th className="num">Budget h</th>
                  <th className="num">Logged h</th>
                  <th className="num">Billable h</th>
                  <th className="num">Non-billable h</th>
                  <th className="num">Remaining h</th>
                  <th>Used</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.projects.map((p) => (
                  <BudgetRow key={p.projectId} project={p} />
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td className="num">{data.totals.budgetHours}</td>
                  <td className="num">{data.totals.loggedHours}</td>
                  <td colSpan={5} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </AsyncView>
    </>
  );
}

function BudgetRow({ project: p }: { project: BudgetProject }) {
  const status = STATUS[p.status];
  return (
    <tr>
      <th scope="row" className={styles.name}>
        {p.code} · {p.name} {!p.isActive && <Badge tone="neutral">Archived</Badge>}
      </th>
      <td className="num">{p.budgetHours}</td>
      <td className="num">{p.loggedHours}</td>
      <td className="num">{p.billableHours}</td>
      <td className="num">{p.nonBillableHours}</td>
      <td className="num">{p.remainingHours}</td>
      <td>
        {p.percentUsed === null ? (
          <span className="muted">No budget set</span>
        ) : (
          <span className={styles.usage}>
            <progress
              max={100}
              value={Math.min(p.percentUsed, 100)}
              aria-label={`${p.code} budget used`}
            />
            <span>{p.percentUsed}%</span>
          </span>
        )}
      </td>
      <td>
        <Badge tone={status.tone}>{status.label}</Badge>
      </td>
    </tr>
  );
}
