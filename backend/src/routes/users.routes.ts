import { Router } from 'express';
import { createUsersController } from '../controllers/users.controller.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { createAuthenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import {
  createUserSchemas,
  getUserSchemas,
  resetPasswordSchemas,
  updateUserSchemas,
} from '../validation/users.schemas.js';

export function createUsersRouter(prisma: PrismaClient): Router {
  const router = Router();
  const controller = createUsersController(prisma);

  router.use(createAuthenticate(prisma));
  router.get('/', controller.list); // scoped by role in the service
  router.get('/direct-reports', authorize('MANAGER'), controller.directReports);
  router.post('/', authorize('ADMIN'), validate(createUserSchemas), controller.create);
  router.get('/:id', validate(getUserSchemas), controller.getById);
  router.patch('/:id', authorize('ADMIN'), validate(updateUserSchemas), controller.update);
  router.post(
    '/:id/password',
    authorize('ADMIN'),
    validate(resetPasswordSchemas),
    controller.setPassword,
  );
  return router;
}
