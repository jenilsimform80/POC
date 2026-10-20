import { hashPassword, verifyPassword } from '../auth/password.js';
import { AppError } from '../errors/app-error.js';
import { isUniqueViolation } from '../errors/prisma-errors.js';
import type { PrismaClient, Role } from '../generated/prisma/client.js';
import type { Db } from './db-types.js';

type EditableRole = Extract<Role, 'CONTRIBUTOR' | 'MANAGER'>;

export interface CreateUserInput {
  email: string;
  name: string;
  role: EditableRole;
  password: string;
  managerId?: string | undefined;
}

export interface UpdateUserInput {
  name?: string | undefined;
  role?: EditableRole | undefined;
  managerId?: string | null | undefined;
  isActive?: boolean | undefined;
}

/** Never includes the password hash. */
const userView = {
  id: true,
  email: true,
  name: true,
  role: true,
  managerId: true,
  isActive: true,
} as const;

const rule = (message: string) => new AppError('BUSINESS_RULE_VIOLATION', 422, message);

/**
 * Every admin write that depends on who is an active manager takes this one lock first, so the
 * check ("manager X is active and has no reports") and the write cannot interleave with another
 * admin's change (e.g. deactivating a manager while a contributor is being assigned to them).
 * User administration is rare, so one global lock costs nothing.
 */
async function lockUserAdministration(tx: Db): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('user-administration', 0))`;
}

async function assertActiveManager(tx: Db, managerId: string): Promise<void> {
  const manager = await tx.user.findFirst({
    where: { id: managerId, role: 'MANAGER', isActive: true },
    select: { id: true },
  });
  if (!manager) throw rule('managerId must be an active manager');
}

/**
 * Managers may report to another manager (so a manager's own timesheet has an approver), but the
 * chain must never loop: A->B->A would leave both timesheets with no one able to decide. Walks up
 * from the proposed manager; reaching `userId` means the assignment would close a cycle.
 * Runs under the user-administration lock, so the chain cannot change while it is walked.
 */
async function assertNoManagerCycle(tx: Db, userId: string, managerId: string): Promise<void> {
  const seen = new Set<string>();
  let current: string | null = managerId;
  while (current !== null && !seen.has(current)) {
    if (current === userId) throw rule('This would create a reporting loop');
    seen.add(current);
    const row: { managerId: string | null } | null = await tx.user.findUnique({
      where: { id: current },
      select: { managerId: true },
    });
    current = row?.managerId ?? null;
  }
}

/**
 * Admin-only (enforced by the route). A contributor must report to an active manager, because the
 * submit step requires one; the check lives here so every caller gets the same rule.
 */
export async function createUser(prisma: PrismaClient, input: CreateUserInput) {
  const passwordHash = await hashPassword(input.password); // slow: keep it outside the lock
  try {
    return await prisma.$transaction(async (tx) => {
      await lockUserAdministration(tx);
      if (input.managerId !== undefined) await assertActiveManager(tx, input.managerId);
      return tx.user.create({
        data: {
          email: input.email,
          name: input.name,
          role: input.role,
          managerId: input.managerId ?? null,
          passwordHash,
        },
        select: userView,
      });
    });
  } catch (error) {
    // The unique index is the real guard; a pre-check would race with a concurrent create.
    if (isUniqueViolation(error)) {
      throw new AppError('CONFLICT', 409, 'A user with this email already exists');
    }
    throw error;
  }
}

/**
 * Edit name, role, manager or active flag. Admin accounts are not editable here (so an admin cannot
 * demote or lock out the last admin, nor themself). The resulting state must be consistent:
 *  - a contributor has an active manager; a manager may have one (never forming a loop);
 *  - a manager with active direct reports cannot be deactivated or demoted (their reports could no
 *    longer submit): reassign the reports first.
 * Deactivating also ends the user's sessions immediately.
 */
export async function updateUser(prisma: PrismaClient, userId: string, input: UpdateUserInput) {
  return prisma.$transaction(async (tx) => {
    await lockUserAdministration(tx);
    const target = await tx.user.findUnique({ where: { id: userId }, select: userView });
    if (!target) throw new AppError('NOT_FOUND', 404, 'User not found');
    if (target.role === 'ADMIN') throw rule('Admin accounts cannot be changed here');

    const role = input.role ?? target.role;
    const isActive = input.isActive ?? target.isActive;
    const managerId = input.managerId === undefined ? target.managerId : input.managerId;

    if (role === 'CONTRIBUTOR' && managerId === null) throw rule('A contributor needs a manager');
    // A manager's own manager is optional (a top-level manager has none).
    if (managerId !== null) {
      if (managerId === userId) throw rule('A user cannot be their own manager');
      // Only checked while the account is (or becomes) active, so a deactivated user whose
      // manager has since left can still be renamed; reactivating them forces a valid manager.
      if (isActive) await assertActiveManager(tx, managerId);
      if (role === 'MANAGER') await assertNoManagerCycle(tx, userId, managerId);
    }

    const losesManagerRole = target.role === 'MANAGER' && (role !== 'MANAGER' || !isActive);
    if (losesManagerRole) {
      const reports = await tx.user.count({ where: { managerId: userId, isActive: true } });
      if (reports > 0) {
        throw rule(
          `This manager still has ${reports} active direct report(s). Reassign them before deactivating or changing the role.`,
        );
      }
    }

    const updated = await tx.user.update({
      where: { id: userId },
      data: { ...(input.name !== undefined && { name: input.name }), role, managerId, isActive },
      select: userView,
    });
    if (target.isActive && !isActive) await tx.session.deleteMany({ where: { userId } });
    return updated;
  });
}

/** Admin sets a new password for another user; all of that user's sessions end. */
export async function resetPassword(prisma: PrismaClient, userId: string, password: string) {
  const passwordHash = await hashPassword(password);
  await prisma.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!target) throw new AppError('NOT_FOUND', 404, 'User not found');
    if (target.role === 'ADMIN') {
      throw rule('Admin passwords cannot be reset here; admins change their own password');
    }
    await tx.user.update({ where: { id: userId }, data: { passwordHash } });
    await tx.session.deleteMany({ where: { userId } });
  });
}

/**
 * A user changes their own password. The current password must be right (a hijacked session alone
 * is not enough). Every other session of the user ends; the current one stays signed in.
 */
export async function changeOwnPassword(
  prisma: PrismaClient,
  userId: string,
  currentSessionId: string | undefined,
  input: { currentPassword: string; newPassword: string },
) {
  const record = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (!record || !(await verifyPassword(record.passwordHash, input.currentPassword))) {
    throw new AppError('UNAUTHENTICATED', 401, 'Current password is incorrect');
  }
  if (input.currentPassword === input.newPassword) {
    throw rule('The new password must be different from the current one');
  }
  const passwordHash = await hashPassword(input.newPassword);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { passwordHash } });
    await tx.session.deleteMany({
      where: {
        userId,
        ...(currentSessionId && { id: { not: currentSessionId } }),
      },
    });
  });
}
