import { apiRequest } from './client';
import type { BudgetReport, HoursReport, ReportDimension } from './types';

export interface HoursReportParams {
  from: string;
  to: string;
  groupBy: ReportDimension[];
  userId?: string;
  projectId?: string;
}

export function getHoursReport(
  params: HoursReportParams,
  signal?: AbortSignal,
): Promise<HoursReport> {
  return apiRequest<HoursReport>('/reports/hours', {
    query: {
      from: params.from,
      to: params.to,
      groupBy: params.groupBy.join(','),
      userId: params.userId,
      projectId: params.projectId,
    },
    ...(signal && { signal }),
  });
}

export interface BudgetReportParams {
  includeArchived?: boolean;
  through?: string;
}

export function getBudgetReport(
  params: BudgetReportParams = {},
  signal?: AbortSignal,
): Promise<BudgetReport> {
  return apiRequest<BudgetReport>('/reports/project-budgets', {
    query: {
      includeArchived: params.includeArchived ? true : undefined,
      through: params.through || undefined,
    },
    ...(signal && { signal }),
  });
}
