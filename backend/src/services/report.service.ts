import { visibleEntriesSql, visibleUsersWhere } from '../authorization/policies.js';
import type { AuthUser } from '../auth/auth-user.js';
import { AppError } from '../errors/app-error.js';
import { Prisma } from '../generated/prisma/client.js';
import { toIsoDate } from '../utils/dates.js';
import type { Db } from './db-types.js';
import type { ReportDimension } from '../validation/reports.schemas.js';

// ASSUMPTIONS (spec unverified): budget usage is flagged WARNING from 80% and OVER above 100%.
export const BUDGET_WARNING_RATIO = 0.8;
const MAX_ROWS = 5000;

const round2 = (value: number) => Math.round(value * 100) / 100;
const num = (value: { toString(): string } | number | null | undefined) => Number(value ?? 0);

/**
 * Whitelisted GROUP BY dimensions. The SQL fragments are constants defined here (no user input);
 * the caller only chooses WHICH of them to use, validated against REPORT_DIMENSIONS.
 * Calendar-date policy: `work_date` is a DATE, so `to_char(work_date, 'YYYY-MM')` is identical in
 * every session time zone (see ADR 0006).
 */
const DIMENSIONS: Record<
  ReportDimension,
  { select: Prisma.Sql; group: Prisma.Sql; order: Prisma.Sql }
> = {
  contributor: {
    select: Prisma.sql`u.id AS "userId", u.name AS "userName"`,
    group: Prisma.sql`u.id, u.name`,
    order: Prisma.sql`u.name ASC, u.id ASC`,
  },
  project: {
    select: Prisma.sql`p.id AS "projectId", p.code AS "projectCode", p.name AS "projectName"`,
    group: Prisma.sql`p.id, p.code, p.name`,
    order: Prisma.sql`p.code ASC, p.id ASC`,
  },
  month: {
    select: Prisma.sql`to_char(te.work_date, 'YYYY-MM') AS "month"`,
    group: Prisma.sql`to_char(te.work_date, 'YYYY-MM')`,
    order: Prisma.sql`"month" ASC`,
  },
};

interface HoursRow {
  userId?: string;
  userName?: string;
  projectId?: string;
  projectCode?: string;
  projectName?: string;
  month?: string;
  total: Prisma.Decimal;
  billable: Prisma.Decimal | null;
  entries: bigint;
}

export interface HoursFilter {
  from: Date;
  to: Date;
  groupBy: ReportDimension[];
  userId?: string | undefined;
  projectId?: string | undefined;
}

/**
 * Hours by contributor / project / month (any combination), aggregated by PostgreSQL.
 * Visibility follows the same role rules as everything else: contributors see their own hours,
 * managers themselves and direct reports, admins everyone. Dates are bound as 'YYYY-MM-DD' text
 * cast to DATE (never as JS Dates, which would be reinterpreted in the session time zone).
 */
export async function getHoursReport(db: Db, actor: AuthUser, filter: HoursFilter) {
  if (filter.userId !== undefined && filter.userId !== actor.id) {
    const visible = await db.user.findFirst({
      where: { AND: [{ id: filter.userId }, visibleUsersWhere(actor)] },
      select: { id: true },
    });
    if (!visible) throw new AppError('NOT_FOUND', 404, 'User not found');
  }

  const dims = filter.groupBy.map((d) => DIMENSIONS[d]);
  const conditions: Prisma.Sql[] = [
    Prisma.sql`te.work_date BETWEEN ${toIsoDate(filter.from)}::date AND ${toIsoDate(filter.to)}::date`,
    visibleEntriesSql(actor, Prisma.sql`te`),
  ];
  if (filter.userId) conditions.push(Prisma.sql`te.user_id = ${filter.userId}::uuid`);
  if (filter.projectId) conditions.push(Prisma.sql`te.project_id = ${filter.projectId}::uuid`);

  const rows = await db.$queryRaw<HoursRow[]>`
    SELECT ${Prisma.join(dims.map((d) => d.select))},
           SUM(te.hours) AS total,
           SUM(te.hours) FILTER (WHERE te.is_billable) AS billable,
           COUNT(*) AS entries
    FROM time_entries te
    JOIN users u ON u.id = te.user_id
    JOIN projects p ON p.id = te.project_id
    WHERE ${Prisma.join(conditions, ' AND ')}
    GROUP BY ${Prisma.join(dims.map((d) => d.group))}
    ORDER BY ${Prisma.join(dims.map((d) => d.order))}
    LIMIT ${MAX_ROWS + 1}`;

  const truncated = rows.length > MAX_ROWS;
  const kept = truncated ? rows.slice(0, MAX_ROWS) : rows;

  const view = kept.map((row) => {
    const total = num(row.total);
    const billable = num(row.billable);
    return {
      ...(filter.groupBy.includes('contributor') && { userId: row.userId, userName: row.userName }),
      ...(filter.groupBy.includes('project') && {
        projectId: row.projectId,
        projectCode: row.projectCode,
        projectName: row.projectName,
      }),
      ...(filter.groupBy.includes('month') && { month: row.month }),
      totalHours: round2(total),
      billableHours: round2(billable),
      nonBillableHours: round2(total - billable),
      entryCount: Number(row.entries),
    };
  });

  const totals = view.reduce(
    (acc, r) => ({
      totalHours: acc.totalHours + r.totalHours,
      billableHours: acc.billableHours + r.billableHours,
      entryCount: acc.entryCount + r.entryCount,
    }),
    { totalHours: 0, billableHours: 0, entryCount: 0 },
  );

  return {
    from: toIsoDate(filter.from),
    to: toIsoDate(filter.to),
    groupBy: filter.groupBy,
    rows: view,
    totals: {
      totalHours: round2(totals.totalHours),
      billableHours: round2(totals.billableHours),
      nonBillableHours: round2(totals.totalHours - totals.billableHours),
      entryCount: totals.entryCount,
    },
    truncated,
  };
}

export type BudgetStatus = 'OK' | 'WARNING' | 'OVER';

export function budgetStatus(budget: number, logged: number): BudgetStatus {
  if (logged > budget) return 'OVER';
  if (budget > 0 && logged >= budget * BUDGET_WARNING_RATIO) return 'WARNING';
  return 'OK';
}

interface BudgetRow {
  id: string;
  code: string;
  name: string;
  budget_hours: Prisma.Decimal;
  is_active: boolean;
  logged: Prisma.Decimal;
  billable: Prisma.Decimal;
}

/**
 * Logged hours vs allocated hours per project, aggregated in PostgreSQL. LEFT JOIN so projects
 * with no hours still appear. Visibility: ADMIN only (enforced by the route): it compares ALL
 * users' hours with a project-wide budget, which a scoped (team-only) view would misstate.
 */
export async function getBudgetReport(
  db: Db,
  filter: { projectId?: string | undefined; through?: Date | undefined; includeArchived: boolean },
) {
  const joinConditions: Prisma.Sql[] = [Prisma.sql`te.project_id = p.id`];
  if (filter.through)
    joinConditions.push(Prisma.sql`te.work_date <= ${toIsoDate(filter.through)}::date`);
  const where: Prisma.Sql[] = [];
  if (!filter.includeArchived) where.push(Prisma.sql`p.is_active`);
  if (filter.projectId) where.push(Prisma.sql`p.id = ${filter.projectId}::uuid`);

  const rows = await db.$queryRaw<BudgetRow[]>`
    SELECT p.id, p.code, p.name, p.budget_hours, p.is_active,
           COALESCE(SUM(te.hours), 0) AS logged,
           COALESCE(SUM(te.hours) FILTER (WHERE te.is_billable), 0) AS billable
    FROM projects p
    LEFT JOIN time_entries te ON ${Prisma.join(joinConditions, ' AND ')}
    ${where.length > 0 ? Prisma.sql`WHERE ${Prisma.join(where, ' AND ')}` : Prisma.empty}
    GROUP BY p.id, p.code, p.name, p.budget_hours, p.is_active
    ORDER BY p.code ASC, p.id ASC`;

  const projects = rows.map((row) => {
    const budget = num(row.budget_hours);
    const logged = num(row.logged);
    const billable = num(row.billable);
    return {
      projectId: row.id,
      code: row.code,
      name: row.name,
      isActive: row.is_active,
      budgetHours: round2(budget),
      loggedHours: round2(logged),
      billableHours: round2(billable),
      nonBillableHours: round2(logged - billable),
      remainingHours: round2(budget - logged),
      percentUsed: budget > 0 ? round2((logged / budget) * 100) : null,
      status: budgetStatus(budget, logged),
    };
  });

  return {
    through: filter.through ? toIsoDate(filter.through) : null,
    projects,
    totals: {
      budgetHours: round2(projects.reduce((s, p) => s + p.budgetHours, 0)),
      loggedHours: round2(projects.reduce((s, p) => s + p.loggedHours, 0)),
    },
  };
}
