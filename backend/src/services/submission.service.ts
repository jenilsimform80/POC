import { ownedByVisibleUser, visibleUsersWhere } from '../authorization/policies.js';
import type { AuthUser } from '../auth/auth-user.js';
import { AppError } from '../errors/app-error.js';
import type { PrismaClient, SubmissionStatus } from '../generated/prisma/client.js';
import { addDays, toIsoDate } from '../utils/dates.js';
import { assertCanDecideSubmission } from './authorization.service.js';
import { recordAudit } from './audit.service.js';
import { assertDatesUnlocked } from './period-lock.service.js';
import { lockUserTimesheet } from './time-entry.service.js';

interface SubmissionRow {
  id: string;
  userId: string;
  weekStart: Date;
  status: SubmissionStatus;
  submittedAt: Date;
  updatedAt: Date;
}

interface ApprovalRow {
  id: string;
  managerId: string;
  decision: 'APPROVED' | 'REJECTED';
  comment: string | null;
  decidedAt: Date;
}

function toSubmissionView(submission: SubmissionRow, approvals?: ApprovalRow[]) {
  return {
    id: submission.id,
    userId: submission.userId,
    weekStart: toIsoDate(submission.weekStart),
    status: submission.status,
    submittedAt: submission.submittedAt,
    updatedAt: submission.updatedAt,
    ...(approvals && {
      approvals: approvals.map((a) => ({
        id: a.id,
        managerId: a.managerId,
        decision: a.decision,
        comment: a.comment,
        decidedAt: a.decidedAt,
      })),
    }),
  };
}

/**
 * Submit (or resubmit after rejection) the actor's own week.
 * Runs under the same per-user lock as entry writes, so an entry edit cannot interleave with
 * submission: whichever commits first wins and the other sees the committed state.
 */
export async function submitWeek(prisma: PrismaClient, actor: AuthUser, weekStart: Date) {
  if (!actor.managerId) {
    throw new AppError(
      'BUSINESS_RULE_VIOLATION',
      422,
      'You have no manager assigned to approve your timesheet',
    );
  }
  // Refuse up front if the assigned manager could never decide it (not a MANAGER, or deactivated):
  // otherwise the week would sit SUBMITTED, and frozen, forever.
  const manager = await prisma.user.findFirst({
    where: { id: actor.managerId, role: 'MANAGER', isActive: true },
    select: { id: true },
  });
  if (!manager) {
    throw new AppError(
      'BUSINESS_RULE_VIOLATION',
      422,
      'Your assigned manager is not an active manager and cannot approve timesheets',
    );
  }

  return prisma.$transaction(async (tx) => {
    await lockUserTimesheet(tx, actor.id);

    const entryCount = await tx.timeEntry.count({
      where: { userId: actor.id, workDate: { gte: weekStart, lte: addDays(weekStart, 6) } },
    });
    if (entryCount === 0) {
      throw new AppError(
        'BUSINESS_RULE_VIOLATION',
        422,
        'Cannot submit a week with no time entries',
      );
    }

    const existing = await tx.weeklySubmission.findUnique({
      where: { userId_weekStart: { userId: actor.id, weekStart } },
    });
    if (existing && existing.status !== 'REJECTED') {
      throw new AppError(
        'INVALID_STATE',
        409,
        `This week is already ${existing.status.toLowerCase()}`,
        { status: existing.status },
      );
    }
    const submission = existing
      ? await tx.weeklySubmission.update({
          where: { id: existing.id },
          data: { status: 'SUBMITTED', submittedAt: new Date() },
        })
      : await tx.weeklySubmission.create({ data: { userId: actor.id, weekStart } });

    await recordAudit(tx, {
      actorId: actor.id,
      action: 'SUBMISSION_SUBMITTED',
      entityType: 'weekly_submission',
      entityId: submission.id,
      metadata: {
        userId: actor.id,
        weekStart: toIsoDate(weekStart),
        resubmission: existing !== null,
      },
    });
    return toSubmissionView(submission);
  });
}

export async function listSubmissions(
  prisma: PrismaClient,
  actor: AuthUser,
  filter: {
    status?: SubmissionStatus | undefined;
    weekStart?: Date | undefined;
    userId?: string | undefined;
    forApproval?: boolean | undefined;
  },
) {
  if (filter.forApproval && actor.role !== 'MANAGER') {
    throw new AppError('FORBIDDEN', 403, 'Only managers have an approval queue');
  }
  if (filter.userId !== undefined && filter.userId !== actor.id) {
    const visible = await prisma.user.findFirst({
      where: { AND: [{ id: filter.userId }, visibleUsersWhere(actor)] },
      select: { id: true },
    });
    if (!visible) throw new AppError('NOT_FOUND', 404, 'User not found');
  }
  // The approval queue means "waiting for my decision" unless a status is asked for explicitly;
  // otherwise old decided weeks would crowd the urgent ones out of the capped list.
  const status = filter.status ?? (filter.forApproval ? 'SUBMITTED' : undefined);
  const submissions = await prisma.weeklySubmission.findMany({
    where: {
      AND: [
        ownedByVisibleUser(actor),
        // The approval queue is strictly "my direct reports", never my own submissions.
        filter.forApproval ? { user: { managerId: actor.id } } : {},
        status ? { status } : {},
        filter.weekStart ? { weekStart: filter.weekStart } : {},
        filter.userId ? { userId: filter.userId } : {},
      ],
    },
    orderBy: [{ weekStart: 'desc' }, { submittedAt: 'desc' }],
    take: 200,
  });
  return submissions.map((s) => toSubmissionView(s));
}

export async function getSubmission(prisma: PrismaClient, actor: AuthUser, id: string) {
  const submission = await prisma.weeklySubmission.findFirst({
    where: { AND: [{ id }, ownedByVisibleUser(actor)] },
    include: { approvals: { orderBy: { decidedAt: 'asc' } } },
  });
  if (!submission) throw new AppError('NOT_FOUND', 404, 'Submission not found');
  return toSubmissionView(submission, submission.approvals);
}

/**
 * Approve or reject. Authorization (owner's direct manager only) is checked inside the
 * transaction; the status-guarded UPDATE makes a double or concurrent decision impossible:
 * exactly one request changes SUBMITTED -> decision, the other gets 409.
 */
export async function decideSubmission(
  prisma: PrismaClient,
  actor: AuthUser,
  submissionId: string,
  decision: 'APPROVED' | 'REJECTED',
  comment: string | undefined,
) {
  return prisma.$transaction(async (tx) => {
    const submission = await assertCanDecideSubmission(tx, actor, submissionId);
    await lockUserTimesheet(tx, submission.userId);
    // Rejecting reopens the week for editing, which is impossible (and would strand the week)
    // if any of its days is in a locked period. Approving a locked week is harmless.
    if (decision === 'REJECTED') {
      await assertDatesUnlocked(tx, [submission.weekStart, addDays(submission.weekStart, 6)]);
    }

    const { count } = await tx.weeklySubmission.updateMany({
      where: { id: submission.id, status: 'SUBMITTED' },
      data: { status: decision },
    });
    if (count === 0) {
      throw new AppError(
        'INVALID_STATE',
        409,
        'Only a submitted timesheet can be approved or rejected',
      );
    }
    await tx.approval.create({
      data: {
        submissionId: submission.id,
        managerId: actor.id,
        decision,
        ...(comment !== undefined && { comment }),
      },
    });
    await recordAudit(tx, {
      actorId: actor.id,
      action: decision === 'APPROVED' ? 'SUBMISSION_APPROVED' : 'SUBMISSION_REJECTED',
      entityType: 'weekly_submission',
      entityId: submission.id,
      metadata: {
        userId: submission.userId,
        weekStart: toIsoDate(submission.weekStart),
        ...(comment !== undefined && { comment }),
      },
    });

    const updated = await tx.weeklySubmission.findUniqueOrThrow({
      where: { id: submission.id },
      include: { approvals: { orderBy: { decidedAt: 'asc' } } },
    });
    return toSubmissionView(updated, updated.approvals);
  });
}
