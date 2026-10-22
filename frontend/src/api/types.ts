// Shapes of the backend's responses (see docs/api-contracts.md). Dates are "YYYY-MM-DD" strings,
// instants are ISO timestamps, hours are numbers.

export type Role = 'CONTRIBUTOR' | 'MANAGER' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  managerId: string | null;
  isActive?: boolean;
  /** Set after an admin reset: only changing the password is allowed until it is done. */
  mustChangePassword?: boolean;
}

export interface Task {
  id: string;
  name: string;
  isActive: boolean;
  /** false when the task is assigned only to other people. */
  canLog: boolean;
  /** true for admins and for the manager who created the task. */
  canManage: boolean;
  /** Only present when `canManage`; empty means open to everyone. */
  assigneeIds?: string[];
}

export interface Project {
  id: string;
  code: string;
  name: string;
  clientName: string | null;
  /** Admin-only: the backend omits allocated hours for everyone else. */
  budgetHours?: number;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
  /** true = only members (and admins) can see it and log time to it. */
  isRestricted: boolean;
  /** Admin-only. */
  memberIds?: string[];
  tasks?: Task[];
}

export interface TimeEntry {
  id: string;
  userId: string;
  projectId: string;
  taskId: string;
  workDate: string;
  hours: number;
  isBillable: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TimesheetWarning {
  code: 'DAILY_HOURS_HIGH' | 'WEEKLY_HOURS_HIGH';
  message: string;
  total: number;
  threshold: number;
  date?: string;
}

export type WeekStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
export type SubmissionStatus = 'SUBMITTED' | 'APPROVED' | 'REJECTED';

export interface WeekSummary {
  userId: string;
  weekStart: string;
  weekEnd: string;
  status: WeekStatus;
  submission: { id: string; status: SubmissionStatus; submittedAt: string } | null;
  entries: TimeEntry[];
  dailyTotals: Record<string, number>;
  weeklyTotal: number;
  billableTotal: number;
  nonBillableTotal: number;
  warnings: TimesheetWarning[];
}

export interface Approval {
  id: string;
  managerId: string;
  decision: 'APPROVED' | 'REJECTED';
  comment: string | null;
  decidedAt: string;
}

export interface Submission {
  id: string;
  userId: string;
  weekStart: string;
  status: SubmissionStatus;
  submittedAt: string;
  updatedAt: string;
  approvals?: Approval[];
}

export interface LockedPeriod {
  period: string;
  lockedAt: string;
  note: string | null;
  lockedBy: { id: string; name: string };
}

export type ReportDimension = 'contributor' | 'project' | 'month';

export interface HoursRow {
  userId?: string;
  userName?: string;
  projectId?: string;
  projectCode?: string;
  projectName?: string;
  month?: string;
  totalHours: number;
  billableHours: number;
  nonBillableHours: number;
  entryCount: number;
}

export interface HoursReport {
  from: string;
  to: string;
  groupBy: ReportDimension[];
  rows: HoursRow[];
  totals: {
    totalHours: number;
    billableHours: number;
    nonBillableHours: number;
    entryCount: number;
  };
  truncated: boolean;
}

export type BudgetStatus = 'OK' | 'WARNING' | 'OVER';

export interface BudgetProject {
  projectId: string;
  code: string;
  name: string;
  isActive: boolean;
  budgetHours: number;
  loggedHours: number;
  billableHours: number;
  nonBillableHours: number;
  remainingHours: number;
  percentUsed: number | null;
  status: BudgetStatus;
}

export interface BudgetReport {
  through: string | null;
  projects: BudgetProject[];
  totals: { budgetHours: number; loggedHours: number };
}
