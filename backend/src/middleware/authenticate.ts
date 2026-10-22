import type { RequestHandler } from 'express';
import { verifyAccessToken } from '../auth/access-token.js';
import { resolveSession } from '../auth/session.service.js';
import { AppError } from '../errors/app-error.js';
import type { PrismaClient } from '../generated/prisma/client.js';

const BEARER = /^Bearer ([A-Za-z0-9._~+/-]+=*)$/i;

/**
 * Requires `Authorization: Bearer <access token>`; attaches the user to `req.auth`.
 *
 * A user whose password an admin reset (`mustChangePassword`) is refused with 403
 * PASSWORD_CHANGE_REQUIRED on every route unless it opts in with `allowPasswordChangeRequired`
 * (only /auth/me and /auth/change-password do). Deny-by-default: a new route is protected
 * without anyone remembering to add a check.
 */
export function createAuthenticate(
  prisma: PrismaClient,
  options: { allowPasswordChangeRequired?: boolean } = {},
): RequestHandler {
  return async (req, res, next) => {
    const unauthenticated = () => {
      // RFC 6750: tell the client which scheme is expected.
      res.set('WWW-Authenticate', 'Bearer');
      next(new AppError('UNAUTHENTICATED', 401, 'Authentication required'));
    };

    const secret = req.app.locals['jwtSecret'] as string; // set once in createApp
    const token = BEARER.exec(req.headers.authorization ?? '')?.[1];
    const claims = token ? await verifyAccessToken(secret, token) : null;
    const user = claims ? await resolveSession(prisma, claims.sessionId, claims.userId) : null;
    if (!claims || !user) {
      unauthenticated();
      return;
    }
    if (user.mustChangePassword && !options.allowPasswordChangeRequired) {
      next(new AppError('PASSWORD_CHANGE_REQUIRED', 403, 'You must change your password first'));
      return;
    }
    req.auth = user;
    req.sessionId = claims.sessionId;
    next();
  };
}
