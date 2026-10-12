import { authUserSelect, type AuthUser } from '../auth/auth-user.js';
import { burnPasswordCheck, verifyPassword } from '../auth/password.js';
import { createSession, destroySession } from '../auth/session.service.js';
import { AppError } from '../errors/app-error.js';
import type { PrismaClient } from '../generated/prisma/client.js';

const INVALID_CREDENTIALS = () => new AppError('UNAUTHENTICATED', 401, 'Invalid email or password');

export interface LoginResult {
  user: AuthUser;
  token: string;
  expiresAt: Date;
}

export async function login(
  prisma: PrismaClient,
  input: { email: string; password: string },
  options: { sessionTtlHours: number; previousToken?: string | undefined },
): Promise<LoginResult> {
  const record = await prisma.user.findUnique({
    where: { email: input.email },
    select: { ...authUserSelect, passwordHash: true, isActive: true },
  });

  if (!record) {
    await burnPasswordCheck(input.password);
    throw INVALID_CREDENTIALS();
  }
  const passwordOk = await verifyPassword(record.passwordHash, input.password);
  // Same error for wrong password and deactivated account: do not reveal which.
  if (!passwordOk || !record.isActive) throw INVALID_CREDENTIALS();

  // Always issue a fresh token (prevents session fixation); drop the one the client sent.
  if (options.previousToken) await destroySession(prisma, options.previousToken);
  const { token, expiresAt } = await createSession(prisma, record.id, options.sessionTtlHours);

  const { id, email, name, role, managerId } = record;
  return { user: { id, email, name, role, managerId }, token, expiresAt };
}

export async function logout(prisma: PrismaClient, token: string | undefined): Promise<void> {
  if (token) await destroySession(prisma, token);
}
