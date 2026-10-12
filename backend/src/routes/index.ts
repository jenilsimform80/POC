import { Router } from 'express';
import type { Env } from '../config/env.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { createAuditRouter } from './audit.routes.js';
import { createAuthRouter } from './auth.routes.js';
import { createHealthRouter } from './health.routes.js';
import { createLockedPeriodsRouter } from './locked-periods.routes.js';
import { createProjectsRouter } from './projects.routes.js';
import { createReportsRouter } from './reports.routes.js';
import { createSubmissionsRouter } from './submissions.routes.js';
import { createTimeEntriesRouter } from './time-entries.routes.js';
import { createTimesheetsRouter } from './timesheets.routes.js';
import { createUsersRouter } from './users.routes.js';

export interface AppDependencies {
  prisma: PrismaClient;
}

export function createApiRouter(deps: AppDependencies, env: Env): Router {
  const router = Router();
  router.use('/health', createHealthRouter(deps.prisma, env.NODE_ENV !== 'test'));
  router.use('/auth', createAuthRouter(deps.prisma, env));
  router.use('/users', createUsersRouter(deps.prisma));
  router.use('/projects', createProjectsRouter(deps.prisma));
  router.use('/time-entries', createTimeEntriesRouter(deps.prisma));
  router.use('/timesheets', createTimesheetsRouter(deps.prisma));
  router.use('/submissions', createSubmissionsRouter(deps.prisma));
  router.use('/locked-periods', createLockedPeriodsRouter(deps.prisma));
  router.use('/audit-logs', createAuditRouter(deps.prisma));
  router.use('/reports', createReportsRouter(deps.prisma));
  return router;
}
