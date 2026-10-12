import { Router } from 'express';
import { createReportsController } from '../controllers/reports.controller.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { createAuthenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { budgetReportSchemas, hoursReportSchemas } from '../validation/reports.schemas.js';

export function createReportsRouter(prisma: PrismaClient): Router {
  const router = Router();
  const c = createReportsController(prisma);

  router.use(createAuthenticate(prisma));
  router.get('/hours', validate(hoursReportSchemas), c.hours); // scoped by role in the service
  router.get('/project-budgets', authorize('ADMIN'), validate(budgetReportSchemas), c.budgets);
  return router;
}
