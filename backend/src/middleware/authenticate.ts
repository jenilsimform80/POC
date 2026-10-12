import type { RequestHandler } from 'express';
import { resolveSession } from '../auth/session.service.js';
import { AppError } from '../errors/app-error.js';
import type { PrismaClient } from '../generated/prisma/client.js';

/** Requires a valid session cookie; attaches the user to `req.auth`. */
export function createAuthenticate(prisma: PrismaClient): RequestHandler {
  return async (req, _res, next) => {
    const cookieName = req.app.locals['sessionCookieName'] as string;
    const token = (req.cookies as Record<string, unknown> | undefined)?.[cookieName];
    const user = typeof token === 'string' ? await resolveSession(prisma, token) : null;
    if (!user) {
      next(new AppError('UNAUTHENTICATED', 401, 'Authentication required'));
      return;
    }
    req.auth = user;
    next();
  };
}
