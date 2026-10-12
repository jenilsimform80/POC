import { Router } from 'express';
import { createProjectsController } from '../controllers/projects.controller.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { createAuthenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import {
  createProjectSchemas,
  createTaskSchemas,
  listProjectsSchemas,
  projectIdSchemas,
  updateProjectSchemas,
  updateTaskSchemas,
} from '../validation/projects.schemas.js';

export function createProjectsRouter(prisma: PrismaClient): Router {
  const router = Router();
  const c = createProjectsController(prisma);
  const adminOnly = authorize('ADMIN');

  router.use(createAuthenticate(prisma));
  // Reading: any signed-in user (everyone logs time against active projects).
  router.get('/', validate(listProjectsSchemas), c.list);
  router.get('/:id', validate(projectIdSchemas), c.get);
  // Writing: admin only.
  router.post('/', adminOnly, validate(createProjectSchemas), c.create);
  router.patch('/:id', adminOnly, validate(updateProjectSchemas), c.update);
  router.post('/:id/tasks', adminOnly, validate(createTaskSchemas), c.addTask);
  router.patch('/:id/tasks/:taskId', adminOnly, validate(updateTaskSchemas), c.patchTask);
  return router;
}
