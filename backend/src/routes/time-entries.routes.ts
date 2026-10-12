import { Router } from 'express';
import { createTimeEntriesController } from '../controllers/time-entries.controller.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { createAuthenticate } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import {
  createEntrySchemas,
  entryIdSchemas,
  listEntriesSchemas,
  updateEntrySchemas,
} from '../validation/time-entries.schemas.js';

export function createTimeEntriesRouter(prisma: PrismaClient): Router {
  const router = Router();
  const c = createTimeEntriesController(prisma);

  router.use(createAuthenticate(prisma));
  router.post('/', validate(createEntrySchemas), c.create);
  router.get('/', validate(listEntriesSchemas), c.list);
  router.get('/:id', validate(entryIdSchemas), c.get);
  router.patch('/:id', validate(updateEntrySchemas), c.update);
  router.delete('/:id', validate(entryIdSchemas), c.remove);
  return router;
}
