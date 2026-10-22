import { useCallback, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useCurrentUser } from '../../auth/useAuth';
import { getBudgetReport, getHoursReport } from '../../api/reports';
import { listSubmissions } from '../../api/submissions';
import { getWeek } from '../../api/timesheets';
import { listUsers } from '../../api/users';
import type { Role } from '../../api/types';
import { AsyncView } from '../../components/ui/AsyncView';
import { EmptyState } from '../../components/ui/EmptyState';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useAsync } from '../../hooks/useAsync';
import { addDays, formatDay, formatMonth, formatRange, mondayOf, todayIso } from '../../lib/dates';
import { ColumnChart, Legend, ProgressBar, RankedBars, type StackedBar } from './charts';
import styles from './Dashboard.module.css';

const MONTHS_BACK = 5;
const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const SHORT_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const round = (n: number) => Math.round(n * 100) / 100;

/** First day of the month `back` months before the month of `iso`. */
function monthStartBack(iso: string, back: number): string {
  const [y = 0, m = 1] = iso.split('-').map(Number);
  const index = y * 12 + (m - 1) - back;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}-01`;
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.panel}>
      <h2>{title}</h2>
      {subtitle && <p className={styles.panelSub}>{subtitle}</p>}
      {children}
    </section>
  );
}

function Kpi({
  label,
  value,
  unit,
  hint,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  hint?: ReactNode;
}) {
  return (
    <li className={styles.kpi}>
      <span className={styles.kpiLabel}>{label}</span>
      <span className={styles.kpiValue}>
        {value}
        {unit && <small>{unit}</small>}
      </span>
      {hint && <span className={styles.kpiHint}>{hint}</span>}
    </li>
  );
}

/**
 * Role-aware overview. Every number comes from the same endpoints the detail screens use, so the
 * backend's scoping (own / team / everyone) applies unchanged; each panel loads on its own so one
 * failing request never blanks the whole dashboard.
 */
export function Dashboard() {
  const user = useCurrentUser();
  const today = todayIso();
  const role: Role = user.role;

  return (
    <div className={styles.dashboard}>
      <WeekAndKpis today={today} role={role} />
      <div className={styles.panels}>
        <MonthlyTrend today={today} />
        <ProjectBreakdown today={today} />
        {role !== 'CONTRIBUTOR' && <TeamBreakdown today={today} />}
        {role !== 'CONTRIBUTOR' && <PendingApprovals />}
        {role === 'ADMIN' && <BudgetHealth />}
      </div>
    </div>
  );
}

function WeekAndKpis({ today, role }: { today: string; role: Role }) {
  const weekStart = mondayOf(today);
  const monthStart = `${today.slice(0, 7)}-01`;
  const load = useCallback(
    async (signal: AbortSignal) => {
      const [week, month] = await Promise.all([
        getWeek(weekStart, undefined, signal),
        getHoursReport({ from: monthStart, to: today, groupBy: ['month'] }, signal),
      ]);
      return { week, month };
    },
    [weekStart, monthStart, today],
  );
  const { state, reload } = useAsync(load);
  const loadPending = useCallback(
    (signal: AbortSignal) =>
      role !== 'CONTRIBUTOR' ? listSubmissions({ forApproval: true }, signal) : Promise.resolve([]),
    [role],
  );
  const pending = useAsync(loadPending);

  return (
    <>
      <AsyncView
        state={state}
        onRetry={reload}
        loadingLabel="Loading your week…"
        errorTitle="Could not load your week"
      >
        {({ week, month }) => {
          const bars: StackedBar[] = SHORT_DAYS.map((label, i) => {
            const date = addDays(week.weekStart, i);
            const day = week.entries.filter((e) => e.workDate === date);
            const billable = day.filter((e) => e.isBillable).reduce((s, e) => s + e.hours, 0);
            return {
              key: date,
              label,
              billable,
              nonBillable: (week.dailyTotals[date] ?? 0) - billable,
            };
          });
          const monthBillable = month.totals.billableHours;
          const monthTotal = month.totals.totalHours;
          const billablePct = monthTotal > 0 ? Math.round((monthBillable / monthTotal) * 100) : 0;
          return (
            <>
              <ul className={styles.kpis}>
                <Kpi
                  label="This week"
                  value={round(week.weeklyTotal)}
                  unit="h"
                  hint={<StatusBadge status={week.status} />}
                />
                <Kpi
                  label={`${formatMonth(today.slice(0, 7))}`}
                  value={round(monthTotal)}
                  unit="h"
                  hint={role === 'CONTRIBUTOR' ? 'Your logged hours' : 'You and your team'}
                />
                <Kpi
                  label="Billable share"
                  value={billablePct}
                  unit="%"
                  hint={`${round(monthBillable)} h billable this month`}
                />
                {role !== 'CONTRIBUTOR' && (
                  <Kpi
                    label="Waiting for your decision"
                    value={pending.state.status === 'success' ? pending.state.data.length : '–'}
                    hint={<Link to="/approvals">Open approvals</Link>}
                  />
                )}
              </ul>
              <Panel
                title="Your week"
                subtitle={`${formatRange(week.weekStart, week.weekEnd)} · hours per day`}
              >
                <Legend />
                <ColumnChart
                  bars={bars}
                  summary={`Hours per day this week: ${bars.map((b) => `${b.label} ${round(b.billable + b.nonBillable)}`).join(', ')}`}
                />
                <p className={styles.panelFooter}>
                  <Link to="/timesheet">
                    {week.status === 'DRAFT' || week.status === 'REJECTED'
                      ? 'Log or submit hours →'
                      : 'Open timesheet →'}
                  </Link>
                </p>
              </Panel>
            </>
          );
        }}
      </AsyncView>
    </>
  );
}

function MonthlyTrend({ today }: { today: string }) {
  const from = monthStartBack(today, MONTHS_BACK);
  const load = useCallback(
    (signal: AbortSignal) => getHoursReport({ from, to: today, groupBy: ['month'] }, signal),
    [from, today],
  );
  const { state, reload } = useAsync(load);
  return (
    <Panel title="Monthly hours" subtitle="Last six months">
      <AsyncView
        state={state}
        onRetry={reload}
        loadingLabel="Loading trend…"
        errorTitle="Could not load the trend"
        isEmpty={(r) => r.rows.length === 0}
        empty={<EmptyState title="No hours yet" description="Logged hours will appear here." />}
      >
        {(report) => {
          const byMonth = new Map(report.rows.map((r) => [r.month, r]));
          const bars: StackedBar[] = Array.from({ length: MONTHS_BACK + 1 }, (_, i) => {
            const start = monthStartBack(today, MONTHS_BACK - i);
            const key = start.slice(0, 7);
            const row = byMonth.get(key);
            return {
              key,
              label: SHORT_MONTHS[Number(key.slice(5)) - 1] ?? key,
              billable: row?.billableHours ?? 0,
              nonBillable: row?.nonBillableHours ?? 0,
            };
          });
          return (
            <>
              <Legend />
              <ColumnChart
                bars={bars}
                summary={`Hours per month: ${bars.map((b) => `${b.label} ${round(b.billable + b.nonBillable)}`).join(', ')}`}
              />
            </>
          );
        }}
      </AsyncView>
    </Panel>
  );
}

function ProjectBreakdown({ today }: { today: string }) {
  const from = `${today.slice(0, 7)}-01`;
  const load = useCallback(
    (signal: AbortSignal) => getHoursReport({ from, to: today, groupBy: ['project'] }, signal),
    [from, today],
  );
  const { state, reload } = useAsync(load);
  return (
    <Panel title="Hours by project" subtitle={`${formatMonth(today.slice(0, 7))}, top projects`}>
      <AsyncView
        state={state}
        onRetry={reload}
        loadingLabel="Loading projects…"
        errorTitle="Could not load project hours"
        isEmpty={(r) => r.rows.length === 0}
        empty={<EmptyState title="Nothing logged this month" />}
      >
        {(report) => {
          const rows = [...report.rows]
            .sort((a, b) => b.totalHours - a.totalHours)
            .slice(0, 6)
            .map((r) => ({
              key: r.projectId ?? r.projectCode ?? '',
              label: r.projectCode ?? 'Project',
              ...(r.projectName && { sublabel: r.projectName }),
              billable: r.billableHours,
              nonBillable: r.nonBillableHours,
            }));
          return (
            <>
              <Legend />
              <RankedBars rows={rows} summary="Hours by project this month" />
              <p className={styles.panelFooter}>
                <Link to="/reports">Full report →</Link>
              </p>
            </>
          );
        }}
      </AsyncView>
    </Panel>
  );
}

function TeamBreakdown({ today }: { today: string }) {
  const from = `${today.slice(0, 7)}-01`;
  const load = useCallback(
    (signal: AbortSignal) => getHoursReport({ from, to: today, groupBy: ['contributor'] }, signal),
    [from, today],
  );
  const { state, reload } = useAsync(load);
  return (
    <Panel title="Hours by person" subtitle={`${formatMonth(today.slice(0, 7))}, top contributors`}>
      <AsyncView
        state={state}
        onRetry={reload}
        loadingLabel="Loading team hours…"
        errorTitle="Could not load team hours"
        isEmpty={(r) => r.rows.length === 0}
        empty={<EmptyState title="Nothing logged this month" />}
      >
        {(report) => {
          const rows = [...report.rows]
            .sort((a, b) => b.totalHours - a.totalHours)
            .slice(0, 6)
            .map((r) => ({
              key: r.userId ?? r.userName ?? '',
              label: r.userName ?? 'Contributor',
              billable: r.billableHours,
              nonBillable: r.nonBillableHours,
            }));
          return (
            <>
              <Legend />
              <RankedBars rows={rows} summary="Hours by person this month" />
            </>
          );
        }}
      </AsyncView>
    </Panel>
  );
}

function PendingApprovals() {
  const load = useCallback(async (signal: AbortSignal) => {
    const [submissions, team] = await Promise.all([
      listSubmissions({ forApproval: true }, signal),
      listUsers(signal),
    ]);
    return { submissions, team };
  }, []);
  const { state, reload } = useAsync(load);
  return (
    <Panel title="Waiting for your decision" subtitle="Oldest weeks first">
      <AsyncView
        state={state}
        onRetry={reload}
        loadingLabel="Loading approvals…"
        errorTitle="Could not load approvals"
        isEmpty={(d) => d.submissions.length === 0}
        empty={
          <EmptyState title="All caught up" description="No timesheets are waiting for you." />
        }
      >
        {({ submissions, team }) => (
          <ul className={styles.list}>
            {[...submissions]
              .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
              .slice(0, 5)
              .map((s) => (
                <li key={s.id} className={styles.listItem}>
                  <span>
                    <strong>{team.find((u) => u.id === s.userId)?.name ?? 'Team member'}</strong>
                    <span className="muted"> · week of {formatDay(s.weekStart)}</span>
                  </span>
                  <Link to={`/approvals/${s.id}`}>Review</Link>
                </li>
              ))}
          </ul>
        )}
      </AsyncView>
    </Panel>
  );
}

function BudgetHealth() {
  const load = useCallback((signal: AbortSignal) => getBudgetReport({}, signal), []);
  const { state, reload } = useAsync(load);
  return (
    <Panel title="Budget health" subtitle="Active projects closest to their budget">
      <AsyncView
        state={state}
        onRetry={reload}
        loadingLabel="Loading budgets…"
        errorTitle="Could not load budgets"
        isEmpty={(r) => r.projects.length === 0}
        empty={<EmptyState title="No projects with a budget" />}
      >
        {(report) => (
          <>
            <ul className={styles.ranked} aria-label="Budget used per project">
              {[...report.projects]
                .sort((a, b) => (b.percentUsed ?? 0) - (a.percentUsed ?? 0))
                .slice(0, 5)
                .map((p) => (
                  <li key={p.projectId}>
                    <div className={styles.rankedHead}>
                      <span>
                        <strong>{p.code}</strong>
                        <span className="muted"> · {p.name}</span>
                      </span>
                      <span>
                        {round(p.loggedHours)} / {round(p.budgetHours)} h
                        {p.percentUsed !== null && ` (${Math.round(p.percentUsed)}%)`}
                      </span>
                    </div>
                    <ProgressBar
                      percent={p.percentUsed ?? 0}
                      tone={
                        p.status === 'OVER' ? 'over' : p.status === 'WARNING' ? 'warning' : 'ok'
                      }
                      label={`${p.code} budget used`}
                    />
                  </li>
                ))}
            </ul>
            <p className={styles.panelFooter}>
              <Link to="/reports/budgets">All budgets →</Link>
            </p>
          </>
        )}
      </AsyncView>
    </Panel>
  );
}
