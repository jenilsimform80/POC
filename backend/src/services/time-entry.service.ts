import { visibleUsersWhere } from '../authorization/policies.js';
import type { AuthUser } from '../auth/auth-user.js';
import { AppError } from '../errors/app-error.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { addDays, mondayOf, toIsoDate } from '../utils/dates.js';
import type { Db } from './db-types.js';
import { assertDatesUnlocked, mapPeriodLockDatabaseError } from './period-lock.service.js';
import { assertDailyLimit, evaluateWarnings, type TimesheetWarning } from './timesheet-rules.js';

interface EntryRow {
  id: string;
  userId: string;
  projectId: string;
  taskId: string;
  workDate: Date;
  hours: { toString(): string };
  isBillable: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toEntryView(entry: EntryRow) {
  return {
    id: entry.id,
    userId: entry.userId,
    projectId: entry.projectId,
    taskId: entry.taskId,
    workDate: toIsoDate(entry.workDate),
    hours: Number(entry.hours),
    isBillable: entry.isBillable,
    notes: entry.notes,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

/**
 * Serializes all timesheet writes of one user for the duration of the transaction.
 * Without it, two concurrent requests could both pass the daily-limit check (read-then-write
 * race) or an edit could slip in while the same user's week is being submitted.
 * Phase 5 adds the (separate) period-lock enforcement; this lock is per user.
 */
export async function lockUserTimesheet(tx: Db, userId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))`;
}

/**
 * Transaction wrapper for entry writes. If the service-layer lock check was somehow bypassed
 * and the database trigger fired instead, the trigger's exception becomes the same 409.
 */
async function inEntryTransaction<T>(prisma: PrismaClient, fn: (tx: Db) => Promise<T>): Promise<T> {
  try {
    return await prisma.$transaction(fn);
  } catch (error) {
    throw mapPeriodLockDatabaseError(error);
  }
}

async function sumHours(
  tx: Db,
  where: {
    userId: string;
    workDate: { gte?: Date; lte?: Date; equals?: Date };
    id?: { not: string };
  },
): Promise<number> {
  const result = await tx.timeEntry.aggregate({ _sum: { hours: true }, where });
  return Number(result._sum.hours ?? 0);
}

/** Submitted or approved weeks are frozen; rejected weeks can be corrected and resubmitted. */
async function assertWeekEditable(tx: Db, userId: string, workDate: Date): Promise<void> {
  const weekStart = mondayOf(workDate);
  const submission = await tx.weeklySubmission.findUnique({
    where: { userId_weekStart: { userId, weekStart } },
    select: { status: true },
  });
  if (submission && submission.status !== 'REJECTED') {
    throw new AppError(
      'WEEK_NOT_EDITABLE',
      409,
      'This week has been submitted and can no longer be edited',
      { weekStart: toIsoDate(weekStart), status: submission.status },
    );
  }
}

/** Project must be active; task must be active and belong to it; date inside project window. */
async function assertProjectTaskUsable(
  tx: Db,
  projectId: string,
  taskId: string,
  workDate: Date,
): Promise<void> {
  const project = await tx.project.findUnique({ where: { id: projectId } });
  if (!project) throw new AppError('NOT_FOUND', 404, 'Project not found');
  if (!project.isActive) {
    throw new AppError(
      'BUSINESS_RULE_VIOLATION',
      422,
      'Project is archived; time cannot be logged',
    );
  }
  const task = await tx.task.findFirst({ where: { id: taskId, projectId } });
  if (!task) {
    throw new AppError('BUSINESS_RULE_VIOLATION', 422, 'Task does not belong to the project');
  }
  if (!task.isActive) {
    throw new AppError('BUSINESS_RULE_VIOLATION', 422, 'Task is archived; time cannot be logged');
  }
  if (
    (project.startDate && workDate < project.startDate) ||
    (project.endDate && workDate > project.endDate)
  ) {
    throw new AppError(
      'BUSINESS_RULE_VIOLATION',
      422,
      'workDate is outside the project’s start/end dates',
    );
  }
}

async function warningsFor(tx: Db, userId: string, workDate: Date): Promise<TimesheetWarning[]> {
  const weekStart = mondayOf(workDate);
  const [dayTotal, weekTotal] = await Promise.all([
    sumHours(tx, { userId, workDate: { equals: workDate } }),
    sumHours(tx, { userId, workDate: { gte: weekStart, lte: addDays(weekStart, 6) } }),
  ]);
  return evaluateWarnings({ date: toIsoDate(workDate), dayTotal, weekTotal });
}

export interface EntryInput {
  projectId: string;
  taskId: string;
  workDate: Date;
  hours: number;
  isBillable: boolean;
  notes?: string | undefined;
}

export async function createEntry(prisma: PrismaClient, actor: AuthUser, input: EntryInput) {
  return inEntryTransaction(prisma, async (tx) => {
    await lockUserTimesheet(tx, actor.id);
    await assertDatesUnlocked(tx, [input.workDate]);
    await assertWeekEditable(tx, actor.id, input.workDate);
    await assertProjectTaskUsable(tx, input.projectId, input.taskId, input.workDate);

    const existing = await sumHours(tx, { userId: actor.id, workDate: { equals: input.workDate } });
    assertDailyLimit(existing + input.hours, toIsoDate(input.workDate));

    const entry = await tx.timeEntry.create({
      data: {
        userId: actor.id,
        projectId: input.projectId,
        taskId: input.taskId,
        workDate: input.workDate,
        hours: input.hours,
        isBillable: input.isBillable,
        ...(input.notes !== undefined && { notes: input.notes }),
      },
    });
    return { entry: toEntryView(entry), warnings: await warningsFor(tx, actor.id, input.workDate) };
  });
}

/** Entry visible to the actor (own, direct report's, or any for admin); else 404. */
export async function getVisibleEntry(db: Db, actor: AuthUser, id: string) {
  const entry = await db.timeEntry.findFirst({
    where: { id, user: visibleUsersWhere(actor) },
  });
  if (!entry) throw new AppError('NOT_FOUND', 404, 'Time entry not found');
  return entry;
}

function assertOwner(actor: AuthUser, entry: { userId: string }): void {
  if (entry.userId !== actor.id) {
    throw new AppError('FORBIDDEN', 403, 'Only the owner can modify a time entry');
  }
}

export async function getEntry(prisma: PrismaClient, actor: AuthUser, id: string) {
  return toEntryView(await getVisibleEntry(prisma, actor, id));
}

export async function listEntries(
  prisma: PrismaClient,
  actor: AuthUser,
  filter: { from: Date; to: Date; projectId?: string | undefined; userId?: string | undefined },
) {
  const targetUserId = filter.userId ?? actor.id;
  if (targetUserId !== actor.id) {
    const visible = await prisma.user.findFirst({
      where: { AND: [{ id: targetUserId }, visibleUsersWhere(actor)] },
      select: { id: true },
    });
    if (!visible) throw new AppError('NOT_FOUND', 404, 'User not found');
  }
  const entries = await prisma.timeEntry.findMany({
    where: {
      userId: targetUserId,
      workDate: { gte: filter.from, lte: filter.to },
      ...(filter.projectId !== undefined && { projectId: filter.projectId }),
    },
    orderBy: [{ workDate: 'asc' }, { createdAt: 'asc' }],
    take: 1000,
  });
  return entries.map(toEntryView);
}

export interface EntryPatch {
  projectId?: string | undefined;
  taskId?: string | undefined;
  workDate?: Date | undefined;
  hours?: number | undefined;
  isBillable?: boolean | undefined;
  notes?: string | null | undefined;
}

export async function updateEntry(
  prisma: PrismaClient,
  actor: AuthUser,
  id: string,
  patch: EntryPatch,
) {
  const found = await getVisibleEntry(prisma, actor, id);
  assertOwner(actor, found);

  return inEntryTransaction(prisma, async (tx) => {
    await lockUserTimesheet(tx, actor.id);
    // Re-read under the lock: it may have been changed or deleted meanwhile.
    const current = await tx.timeEntry.findFirst({ where: { id, userId: actor.id } });
    if (!current) throw new AppError('NOT_FOUND', 404, 'Time entry not found');

    const next = {
      projectId: patch.projectId ?? current.projectId,
      taskId: patch.taskId ?? current.taskId,
      workDate: patch.workDate ?? current.workDate,
      hours: patch.hours ?? Number(current.hours),
      isBillable: patch.isBillable ?? current.isBillable,
      notes: patch.notes !== undefined ? patch.notes : current.notes,
    };

    // Neither the month the entry leaves nor the one it lands in may be locked...
    await assertDatesUnlocked(tx, [current.workDate, next.workDate]);
    // ...and both the week it leaves and the week it lands in must still be editable.
    await assertWeekEditable(tx, actor.id, current.workDate);
    await assertWeekEditable(tx, actor.id, next.workDate);
    // Only when the project, task or date actually changes: an unrelated edit (hours, notes,
    // billable) must still work after an admin archived the project, otherwise a rejected week
    // could never be corrected.
    const referencesChanged =
      next.projectId !== current.projectId ||
      next.taskId !== current.taskId ||
      next.workDate.getTime() !== current.workDate.getTime();
    if (referencesChanged) {
      await assertProjectTaskUsable(tx, next.projectId, next.taskId, next.workDate);
    }

    const others = await sumHours(tx, {
      userId: actor.id,
      workDate: { equals: next.workDate },
      id: { not: id },
    });
    assertDailyLimit(others + next.hours, toIsoDate(next.workDate));

    const entry = await tx.timeEntry.update({ where: { id }, data: next });
    return { entry: toEntryView(entry), warnings: await warningsFor(tx, actor.id, next.workDate) };
  });
}

export async function deleteEntry(
  prisma: PrismaClient,
  actor: AuthUser,
  id: string,
): Promise<void> {
  const found = await getVisibleEntry(prisma, actor, id);
  assertOwner(actor, found);

  await inEntryTransaction(prisma, async (tx) => {
    await lockUserTimesheet(tx, actor.id);
    const current = await tx.timeEntry.findFirst({ where: { id, userId: actor.id } });
    if (!current) throw new AppError('NOT_FOUND', 404, 'Time entry not found');
    await assertDatesUnlocked(tx, [current.workDate]);
    await assertWeekEditable(tx, actor.id, current.workDate);
    await tx.timeEntry.delete({ where: { id } });
  });
}
