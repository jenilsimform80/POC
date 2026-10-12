import { Router } from 'express';
import { createAuditController } from '../controllers/audit.controller.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { createAuthenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { listAuditSchemas } from '../validation/audit.schemas.js';

export function createAuditRouter(prisma: PrismaClient): Router {
  const router = Router();
  const c = createAuditController(prisma);

  router.use(createAuthenticate(prisma));
  router.get('/', authorize('ADMIN'), validate(listAuditSchemas), c.list);
  return router;
}
