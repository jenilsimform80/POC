import { visibleUsersWhere } from '../authorization/policies.js';
import type { AuthUser } from '../auth/auth-user.js';
import { AppError } from '../errors/app-error.js';
import type { Db } from './db-types.js';

const notFound = (what: string) => new AppError('NOT_FOUND', 404, `${what} not found`);

/**
 * Only the submission owner's direct manager may approve or reject it.
 * Admins, other managers, the owner themself and contributors are all refused.
 * "Not your report" and "does not exist" are indistinguishable (404) so ids cannot be probed.
 */
export async function assertCanDecideSubmission(prisma: Db, actor: AuthUser, submissionId: string) {
  if (actor.role !== 'MANAGER') {
    throw new AppError('FORBIDDEN', 403, 'Only a manager can approve or reject timesheets');
  }
  const submission = await prisma.weeklySubmission.findFirst({
    where: { id: submissionId, user: { managerId: actor.id } },
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
