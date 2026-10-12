import { Router } from 'express';
import { createGetDatabaseHealth, getHealth } from '../controllers/health.controller.js';
import type { DatabaseProbe } from '../db/prisma.js';

export function createHealthRouter(db: DatabaseProbe, logErrors: boolean): Router {
  const router = Router();
  router.get('/', getHealth);
  router.get('/db', createGetDatabaseHealth(db, logErrors));
  return router;
}
