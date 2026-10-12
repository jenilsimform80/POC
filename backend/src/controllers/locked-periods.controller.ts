import type { RequestHandler } from 'express';
import type { PrismaClient } from '../generated/prisma/client.js';
import { requireAuth } from '../middleware/authorize.js';
import { getValidated } from '../middleware/validate.js';
import { listLockedPeriods, lockPeriod, unlockPeriod } from '../services/period-lock.service.js';
import type {
  lockPeriodSchemas,
  unlockPeriodSchemas,
} from '../validation/locked-periods.schemas.js';

export function createLockedPeriodsController(prisma: PrismaClient) {
  const list: RequestHandler = async (_req, res) => {
    res.status(200).json({ lockedPeriods: await listLockedPeriods(prisma) });
  };

  const lock: RequestHandler = async (req, res) => {
    const { body } = getValidated<typeof lockPeriodSchemas>(res);
    const lockedPeriod = await lockPeriod(prisma, requireAuth(req), body.period, body.note);
    res.status(201).json({ lockedPeriod });
  };

  const unlock: RequestHandler = async (req, res) => {
    const { params, body } = getValidated<typeof unlockPeriodSchemas>(res);
    await unlockPeriod(prisma, requireAuth(req), params.period, body.reason);
    res.status(204).end();
  };

  return { list, lock, unlock };
}
