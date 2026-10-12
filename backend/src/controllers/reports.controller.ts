import type { RequestHandler } from 'express';
import type { PrismaClient } from '../generated/prisma/client.js';
import { requireAuth } from '../middleware/authorize.js';
import { getValidated } from '../middleware/validate.js';
import { getBudgetReport, getHoursReport } from '../services/report.service.js';
import type { budgetReportSchemas, hoursReportSchemas } from '../validation/reports.schemas.js';

export function createReportsController(prisma: PrismaClient) {
  const hours: RequestHandler = async (req, res) => {
    const { query } = getValidated<typeof hoursReportSchemas>(res);
    res.status(200).json(await getHoursReport(prisma, requireAuth(req), query));
  };

  const budgets: RequestHandler = async (_req, res) => {
    const { query } = getValidated<typeof budgetReportSchemas>(res);
    res.status(200).json(
      await getBudgetReport(prisma, {
        projectId: query.projectId,
        through: query.through,
        includeArchived: query.includeArchived ?? false,
      }),
    );
  };

  return { hours, budgets };
}
