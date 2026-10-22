import { visibleUsersWhere } from '../authorization/policies.js';
import type { AuthUser } from '../auth/auth-user.js';
import { AppError } from '../errors/app-error.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { Db } from './db-types.js';

const notFound = (what: string) => new AppError('NOT_FOUND', 404, `${what} not found`);

/**
 * Owners whose own manager could never decide their week: no manager assigned, or the manager is
 * deactivated or no longer has the MANAGER role. Their submissions fall back to the admins.
 */
export const unmanagedOwnerWhere: Prisma.UserWhereInput = {
  OR: [
    { managerId: null },
    { manager: { OR: [{ isActive: false }, { role: { not: 'MANAGER' } }] } },
  ],
};

/**
 * Who may decide a submission:
 * - the owner's direct manager (role MANAGER), or
 * - any ADMIN when the owner has no usable manager (see `unmanagedOwnerWhere`) - never their own.
 * Everyone else (other managers, the owner, colleagues, admins when a manager exists) is refused.
 * "Not yours to decide" and "does not exist" are indistinguishable (404) so ids cannot be probed.
 */
export async function assertCanDecideSubmission(prisma: Db, actor: AuthUser, submissionId: string) {
  if (actor.role !== 'MANAGER' && actor.role !== 'ADMIN') {
    throw new AppError(
      'FORBIDDEN',
      403,
      'Only a manager or admin can approve or reject timesheets',
    );
  }
  const submission = await prisma.weeklySubmission.findFirst({
    where: {
      id: submissionId,
      ...(actor.role === 'MANAGER'
        ? { user: { managerId: actor.id } }
        : { userId: { not: actor.id }, user: unmanagedOwnerWhere }),
    },
  });
  if (!submission) throw notFound('Submission');
  return submission;
}

export async function getVisibleUser(prisma: Db, actor: AuthUser, userId: string) {
  const user = await prisma.user.findFirst({
    where: { AND: [{ id: userId }, visibleUsersWhere(actor)] },
    select: userView,
  });
  if (!user) throw notFound('User');
  return user;
}

export function listVisibleUsers(prisma: Db, actor: AuthUser) {
  return prisma.user.findMany({
    where: visibleUsersWhere(actor),
    select: userView,
    orderBy: { name: 'asc' },
  });
}

export function listDirectReports(prisma: Db, manager: AuthUser) {
  return prisma.user.findMany({
    where: { managerId: manager.id },
    select: userView,
    orderBy: { name: 'asc' },
  });
}

const userView = {
  id: true,
  email: true,
  name: true,
  role: true,
  managerId: true,
  isActive: true,
} as const;
