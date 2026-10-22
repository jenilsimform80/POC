import { Router } from 'express';
import { createSubmissionsController } from '../controllers/submissions.controller.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { createAuthenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import {
  approveSchemas,
  listSubmissionsSchemas,
  rejectSchemas,
  submissionIdSchemas,
  submitWeekSchemas,
} from '../validation/submissions.schemas.js';

export function createSubmissionsRouter(prisma: PrismaClient): Router {
  const router = Router();
  const c = createSubmissionsController(prisma);

  router.use(createAuthenticate(prisma));
  router.post('/', validate(submitWeekSchemas), c.submit);
  router.get('/', validate(listSubmissionsSchemas), c.list);
  router.get('/:id', validate(submissionIdSchemas), c.get);
  // Role gate here; "is this mine to decide?" (direct manager, or admin fallback) is in the service.
  router.post('/:id/approve', authorize('MANAGER', 'ADMIN'), validate(approveSchemas), c.approve);
  router.post('/:id/reject', authorize('MANAGER', 'ADMIN'), validate(rejectSchemas), c.reject);
  return router;
}
