import { createHash, randomBytes } from 'node:crypto';
import type { PrismaClient } from '../generated/prisma/client.js';
import { authUserSelect, type AuthUser } from './auth-user.js';

/**
 * In production the cookie uses the `__Host-` prefix: browsers then only accept it if it is Secure,
 * has Path=/ and NO Domain, so a sibling subdomain cannot plant a cookie of the same name
 * ("cookie tossing"). Over plain-HTTP local development the prefix cannot be used.
 */
export function sessionCookieName(nodeEnv: string): string {
  return nodeEnv === 'production' ? '__Host-sid' : 'sid';
}

/** The cookie holds a random token; the database holds only its SHA-256 hash. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createSession(
  prisma: PrismaClient,
  userId: string,
  ttlHours: number,
  now: Date = new Date(),
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + ttlHours * 3_600_000);
  await prisma.session.create({ data: { tokenHash: hashToken(token), userId, expiresAt } });
  return { token, expiresAt };
}

/** Returns the user for a valid, unexpired session of an active user; otherwise null. */
export async function resolveSession(
  prisma: PrismaClient,
  token: string,
  now: Date = new Date(),
): Promise<AuthUser | null> {
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      expiresAt: true,
      user: { select: { ...authUserSelect, isActive: true } },
    },
  });
  if (!session) return null;

  if (session.expiresAt <= now) {
    await prisma.session.deleteMany({ where: { id: session.id } });
    return null;
  }
  if (!session.user.isActive) return null;

  const { id, email, name, role, managerId } = session.user;
  return { id, email, name, role, managerId };
}

export async function destroySession(prisma: PrismaClient, token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}
