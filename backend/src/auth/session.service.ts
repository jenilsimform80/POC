import { createHash, randomBytes } from 'node:crypto';
import type { PrismaClient } from '../generated/prisma/client.js';
import { authUserSelect, type AuthUser } from './auth-user.js';

/**
 * A row in `sessions` is one login. Its random token is the REFRESH token: the client holds the
 * token, the database holds only its SHA-256 hash. The short-lived JWT access token names the row
 * (`sid`), so deleting the row signs the user out everywhere at once.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const newToken = () => randomBytes(32).toString('base64url');

export async function createSession(
  prisma: PrismaClient,
  userId: string,
  ttlHours: number,
  now: Date = new Date(),
): Promise<{ sessionId: string; refreshToken: string; expiresAt: Date }> {
  const refreshToken = newToken();
  const expiresAt = new Date(now.getTime() + ttlHours * 3_600_000);
  const session = await prisma.session.create({
    data: { tokenHash: hashToken(refreshToken), userId, expiresAt },
    select: { id: true },
  });
  return { sessionId: session.id, refreshToken, expiresAt };
}

/**
 * Returns the user if the session exists, is unexpired and belongs to `userId` and that user is
 * still active; otherwise null. Called on every authenticated request so that logout, password
 * change and deactivation take effect immediately even though the JWT itself is still unexpired.
 */
export async function resolveSession(
  prisma: PrismaClient,
  sessionId: string,
  userId: string,
  now: Date = new Date(),
): Promise<AuthUser | null> {
  const session = await prisma.session.findFirst({
    where: { id: sessionId, userId },
    select: { expiresAt: true, user: { select: { ...authUserSelect, isActive: true } } },
  });
  if (!session) return null;

  if (session.expiresAt <= now) {
    await prisma.session.deleteMany({ where: { id: sessionId } });
    return null;
  }
  if (!session.user.isActive) return null;

  const { id, email, name, role, managerId, mustChangePassword } = session.user;
  return { id, email, name, role, managerId, mustChangePassword };
}

/**
 * Exchanges a refresh token for a new one (rotation). The swap is a single conditional UPDATE, so if
 * two requests present the same token only one wins; the loser, and any later replay of the old
 * token, finds no matching row. The absolute expiry is NOT extended: a session ends at its original
 * `expiresAt` no matter how often it is refreshed.
 */
export async function rotateRefreshToken(
  prisma: PrismaClient,
  refreshToken: string,
  now: Date = new Date(),
): Promise<{ sessionId: string; userId: string; refreshToken: string; expiresAt: Date } | null> {
  const next = newToken();
  const rows = await prisma.$queryRaw<{ id: string; user_id: string; expires_at: Date }[]>`
    UPDATE sessions SET token_hash = ${hashToken(next)}
    WHERE token_hash = ${hashToken(refreshToken)} AND expires_at > ${now}
    RETURNING id, user_id, expires_at`;
  const row = rows[0];
  if (!row) return null;
  return { sessionId: row.id, userId: row.user_id, refreshToken: next, expiresAt: row.expires_at };
}

export async function destroySessionByRefreshToken(
  prisma: PrismaClient,
  refreshToken: string,
): Promise<void> {
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(refreshToken) } });
}
