import { signAccessToken } from '../auth/access-token.js';
import { authUserSelect, type AuthUser } from '../auth/auth-user.js';
import { burnPasswordCheck, verifyPassword } from '../auth/password.js';
import {
  createSession,
  destroySessionByRefreshToken,
  rotateRefreshToken,
} from '../auth/session.service.js';
import { AppError } from '../errors/app-error.js';
import type { PrismaClient } from '../generated/prisma/client.js';

const INVALID_CREDENTIALS = () => new AppError('UNAUTHENTICATED', 401, 'Invalid email or password');
const INVALID_REFRESH = () =>
  new AppError('UNAUTHENTICATED', 401, 'Invalid or expired refresh token');

export interface TokenOptions {
  jwtSecret: string;
  accessTokenTtlMinutes: number;
  sessionTtlHours: number;
}

export interface TokenSet {
  accessToken: string;
  /** Seconds until `accessToken` expires. */
  expiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export interface LoginResult extends TokenSet {
  user: AuthUser;
}

async function issueAccessToken(options: TokenOptions, userId: string, sessionId: string) {
  const { token, expiresInSeconds } = await signAccessToken(
    options.jwtSecret,
    { userId, sessionId },
    options.accessTokenTtlMinutes,
  );
  return { accessToken: token, expiresIn: expiresInSeconds };
}

export async function login(
  prisma: PrismaClient,
  input: { email: string; password: string },
  options: TokenOptions,
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

  const session = await createSession(prisma, record.id, options.sessionTtlHours);
  const access = await issueAccessToken(options, record.id, session.sessionId);

  const { id, email, name, role, managerId, mustChangePassword } = record;
  return {
    user: { id, email, name, role, managerId, mustChangePassword },
    ...access,
    refreshToken: session.refreshToken,
    refreshTokenExpiresAt: session.expiresAt,
  };
}

/** Rotates the refresh token and issues a new access token. The old refresh token stops working. */
export async function refresh(
  prisma: PrismaClient,
  refreshToken: string,
  options: TokenOptions,
): Promise<LoginResult> {
  const rotated = await rotateRefreshToken(prisma, refreshToken);
  if (!rotated) throw INVALID_REFRESH();

  const user = await prisma.user.findUnique({
    where: { id: rotated.userId },
    select: { ...authUserSelect, isActive: true },
  });
  if (!user?.isActive) {
    await destroySessionByRefreshToken(prisma, rotated.refreshToken);
    throw INVALID_REFRESH();
  }

  const access = await issueAccessToken(options, user.id, rotated.sessionId);
  const { id, email, name, role, managerId, mustChangePassword } = user;
  return {
    user: { id, email, name, role, managerId, mustChangePassword },
    ...access,
    refreshToken: rotated.refreshToken,
    refreshTokenExpiresAt: rotated.expiresAt,
  };
}

export async function logout(prisma: PrismaClient, refreshToken: string): Promise<void> {
  await destroySessionByRefreshToken(prisma, refreshToken);
}
