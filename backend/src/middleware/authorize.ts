import type { RequestHandler } from 'express';
import type { AuthUser } from '../auth/auth-user.js';
import { AppError } from '../errors/app-error.js';
import type { Role } from '../generated/prisma/client.js';

/** Role gate. Must run after `authenticate`. Ownership checks belong in services, not here. */
export function authorize(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) {
      next(new AppError('UNAUTHENTICATED', 401, 'Authentication required'));
      return;
    }
    if (!roles.includes(req.auth.role)) {
      next(new AppError('FORBIDDEN', 403, 'You do not have permission to perform this action'));
      return;
    }
    next();
  };
}

/** Typed accessor for controllers that sit behind `authenticate`. */
export function requireAuth(req: { auth?: AuthUser }): AuthUser {
  if (!req.auth) throw new AppError('UNAUTHENTICATED', 401, 'Authentication required');
  return req.auth;
}
