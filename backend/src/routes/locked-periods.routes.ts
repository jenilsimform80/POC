import { Router } from 'express';
import { createLockedPeriodsController } from '../controllers/locked-periods.controller.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { createAuthenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { lockPeriodSchemas, unlockPeriodSchemas } from '../validation/locked-periods.schemas.js';

export function createLockedPeriodsRouter(prisma: PrismaClient): Router {
  const router = Router();
  const c = createLockedPeriodsController(prisma);
  const adminOnly = authorize('ADMIN');

  router.use(createAuthenticate(prisma));
  // Everyone signed in may see which months are locked (the UI needs it to disable editing).
  router.get('/', c.list);
  router.post('/', adminOnly, validate(lockPeriodSchemas), c.lock);
  router.post('/:period/unlock', adminOnly, validate(unlockPeriodSchemas), c.unlock);
  return router;
}
