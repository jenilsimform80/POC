import { Router } from 'express';
import { createTimeEntriesController } from '../controllers/time-entries.controller.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { createAuthenticate } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import { weekSchemas } from '../validation/time-entries.schemas.js';

export function createTimesheetsRouter(prisma: PrismaClient): Router {
  const router = Router();
  const c = createTimeEntriesController(prisma);

  router.use(createAuthenticate(prisma));
  router.get('/:weekStart', validate(weekSchemas), c.week);
  return router;
}
