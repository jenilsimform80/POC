import type { AuthUser } from '../auth/auth-user.js';
import { AppError } from '../errors/app-error.js';
import { DB_PERIOD_LOCKED, isUniqueViolation, postgresErrorCode } from '../errors/prisma-errors.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { recordAudit } from './audit.service.js';
import type { Db } from './db-types.js';

/** "YYYY-MM" of a calendar date (UTC). */
export function periodOf(date: Date): string {
  return date.toISOString().slice(0, 7);
}

export function periodStartOf(period: string): Date {
  return new Date(`${period}-01T00:00:00.000Z`);
}

function nextMonthStart(period: string): Date {
  const start = periodStartOf(period);
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
}

/**
 * The advisory-lock key MUST equal the one in the database trigger
 * (`hashtextextended('period_lock:' || to_char(date, 'YYYY-MM'), 0)`); both sides serialize on it.
 */
async function acquirePeriodLock(
  tx: Db,
  period: string,
  mode: 'shared' | 'exclusive',
): Promise<void> {
  const key = `period_lock:${period}`;
  if (mode === 'shared') {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(hashtextextended(${key}, 0))`;
  } else {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
  }
}

function periodLockedError(period: string, enforcedBy: 'service' | 'database') {
  return new AppError('PERIOD_LOCKED', 409, `Period ${period} is locked and cannot be modified`, {
    period,
    enforcedBy,
  });
}

/**
 * Service-layer guard (layer 1): refuses with a clear 409 if any of the dates falls in a locked
 * month. It takes the same shared advisory lock as the trigger, so a lock being committed
 * concurrently is either seen here or waits for this transaction. The trigger (layer 2) repeats
 * the check inside the database for every other write path.
 */
export async function assertDatesUnlocked(tx: Db, dates: Date[]): Promise<void> {
  const periods = [...new Set(dates.map(periodOf))].sort();
  for (const period of periods) {
    await acquirePeriodLock(tx, period, 'shared');
    const locked = await tx.lockedPeriod.findUnique({
      where: { periodStart: periodStartOf(period) },
      select: { id: true },
    });
    if (locked) throw periodLockedError(period, 'service');
  }
}

/** Layer-2 hit: translate the trigger's exception into the same API error. */
export function mapPeriodLockDatabaseError(error: unknown): unknown {
  if (postgresErrorCode(error) === DB_PERIOD_LOCKED) {
    const message = error instanceof Error ? error.message : '';
    const period = /period (\d{4}-\d{2}) is locked/.exec(message)?.[1] ?? 'unknown';
    return periodLockedError(period, 'database');
  }
  return error;
}

export function toLockedPeriodView(row: {
  periodStart: Date;
  lockedAt: Date;
  note: string | null;
  lockedBy: { id: string; name: string };
}) {
  return {
    period: periodOf(row.periodStart),
    lockedAt: row.lockedAt,
    note: row.note,
    lockedBy: { id: row.lockedBy.id, name: row.lockedBy.name },
  };
}

const lockedByInclude = { lockedBy: { select: { id: true, name: true } } } as const;

export async function listLockedPeriods(prisma: PrismaClient) {
  const rows = await prisma.lockedPeriod.findMany({
    include: lockedByInclude,
    orderBy: { periodStart: 'desc' },
  });
  return rows.map(toLockedPeriodView);
}

/**
 * Lock a calendar month. Takes the period lock EXCLUSIVELY: it waits for in-flight edits of that
 * month to commit and blocks new ones until this transaction commits, so no entry can change
 * after the lock is visible. The audit record stores how many entries/hours were frozen, which
 * both documents the billing snapshot and lets tests prove nothing changed afterwards.
 */
export async function lockPeriod(
  prisma: PrismaClient,
  actor: AuthUser,
  period: string,
  note: string | undefined,
) {
  return prisma.$transaction(async (tx) => {
    await acquirePeriodLock(tx, period, 'exclusive');

    let row;
    try {
      row = await tx.lockedPeriod.create({
        data: {
          periodStart: periodStartOf(period),
          lockedById: actor.id,
          ...(note !== undefined && { note }),
        },
        include: lockedByInclude,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError('CONFLICT', 409, `Period ${period} is already locked`);
      }
      throw error;
    }

    const frozen = await tx.timeEntry.aggregate({
      _count: true,
      _sum: { hours: true },
      where: { workDate: { gte: periodStartOf(period), lt: nextMonthStart(period) } },
    });
    await recordAudit(tx, {
      actorId: actor.id,
      action: 'PERIOD_LOCKED',
      entityType: 'locked_period',
      entityId: row.id,
      metadata: {
        period,
        entryCount: frozen._count,
        totalHours: Number(frozen._sum.hours ?? 0),
        ...(note !== undefined && { note }),
      },
    });
    return toLockedPeriodView(row);
  });
}

/** Unlock (admin, reason required). The lock row is deleted; the audit trail keeps the history. */
export async function unlockPeriod(
  prisma: PrismaClient,
  actor: AuthUser,
  period: string,
  reason: string,
) {
  await prisma.$transaction(async (tx) => {
    await acquirePeriodLock(tx, period, 'exclusive');

    const existing = await tx.lockedPeriod.findUnique({
      where: { periodStart: periodStartOf(period) },
      select: { id: true, lockedAt: true, lockedById: true },
    });
    if (!existing) throw new AppError('NOT_FOUND', 404, `Period ${period} is not locked`);

    await tx.lockedPeriod.delete({ where: { id: existing.id } });
    await recordAudit(tx, {
      actorId: actor.id,
      action: 'PERIOD_UNLOCKED',
      entityType: 'locked_period',
      entityId: existing.id,
      metadata: {
        period,
        reason,
        lockedAt: existing.lockedAt.toISOString(),
        lockedById: existing.lockedById,
      },
    });
  });
}
