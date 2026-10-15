import { hashPassword } from '../auth/password.js';
import { AppError } from '../errors/app-error.js';
import { isUniqueViolation } from '../errors/prisma-errors.js';
import type { PrismaClient, Role } from '../generated/prisma/client.js';

export interface CreateUserInput {
  email: string;
  name: string;
  role: Extract<Role, 'CONTRIBUTOR' | 'MANAGER'>;
  password: string;
  managerId?: string | undefined;
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

/**
 * Admin-only (enforced by the route). A contributor must report to an active manager, because the
 * submit step requires one; the check lives here so every caller gets the same rule.
 */
export async function createUser(prisma: PrismaClient, input: CreateUserInput) {
  if (input.managerId !== undefined) {
    const manager = await prisma.user.findFirst({
      where: { id: input.managerId, role: 'MANAGER', isActive: true },
      select: { id: true },
    });
    if (!manager) {
      throw new AppError('BUSINESS_RULE_VIOLATION', 422, 'managerId must be an active manager');
    }
  }

  const passwordHash = await hashPassword(input.password);
  try {
    return await prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        role: input.role,
        managerId: input.managerId ?? null,
        passwordHash,
      },
      select: userView,
    });
  } catch (error) {
    // The unique index is the real guard; a pre-check would race with a concurrent create.
    if (isUniqueViolation(error)) {
      throw new AppError('CONFLICT', 409, 'A user with this email already exists');
    }
    throw error;
  }
}
