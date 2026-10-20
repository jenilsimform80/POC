import { SignJWT, jwtVerify } from 'jose';

const ISSUER = 'timesheets-api';
const AUDIENCE = 'timesheets-web';

export interface AccessTokenClaims {
  userId: string;
  /** The login session (refresh-token row) this access token belongs to. */
  sessionId: string;
}

const key = (secret: string) => new TextEncoder().encode(secret);

export async function signAccessToken(
  secret: string,
  claims: AccessTokenClaims,
  ttlMinutes: number,
  now: Date = new Date(),
): Promise<{ token: string; expiresInSeconds: number }> {
  const expiresInSeconds = Math.round(ttlMinutes * 60);
  const issuedAt = Math.floor(now.getTime() / 1000);
  const token = await new SignJWT({ sid: claims.sessionId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + expiresInSeconds)
    .sign(key(secret));
  return { token, expiresInSeconds };
}

/** Returns the claims of a valid, unexpired token, or null for anything else (never throws). */
export async function verifyAccessToken(
  secret: string,
  token: string,
  now: Date = new Date(),
): Promise<AccessTokenClaims | null> {
  try {
    // Pinning the algorithm list blocks "alg: none" and algorithm-confusion tricks.
    const { payload } = await jwtVerify(token, key(secret), {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: AUDIENCE,
      currentDate: now,
    });
    const { sub, sid } = payload;
    if (typeof sub !== 'string' || typeof sid !== 'string') return null;
    return { userId: sub, sessionId: sid };
  } catch {
    return null;
  }
}
