import type { RequestHandler } from 'express';
import type { DatabaseProbe } from '../db/prisma.js';
import { getDatabaseHealth, getHealthStatus } from '../services/health.service.js';

export const getHealth: RequestHandler = (_req, res) => {
  res.status(200).json(getHealthStatus());
};

export function createGetDatabaseHealth(db: DatabaseProbe, logErrors: boolean): RequestHandler {
  return async (_req, res) => {
    const health = await getDatabaseHealth(
      db,
      logErrors ? (error) => console.error('Database health check failed:', error) : undefined,
    );
    res.status(health.status === 'ok' ? 200 : 503).json(health);
  };
}
