import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { Env } from '../config/env.js';
import { createAuthController } from '../controllers/auth.controller.js';
import { AppError } from '../errors/app-error.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { createAuthenticate } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import { changePasswordSchemas, loginSchemas } from '../validation/auth.schemas.js';

export function createAuthRouter(prisma: PrismaClient, env: Env): Router {
  const router = Router();
  const controller = createAuthController(prisma, env);

  // Brute-force protection: only FAILED logins count toward the limit (per client IP).
  const loginLimiter = rateLimit({
    windowMs: env.LOGIN_RATE_LIMIT_WINDOW_MINUTES * 60_000,
    limit: env.LOGIN_RATE_LIMIT_MAX,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(new AppError('RATE_LIMITED', 429, 'Too many failed login attempts. Try again later.'));
    },
  });

  // Coarse cap on every attempt (even successful ones): a valid account could otherwise loop logins
  // to burn CPU/memory on argon2 and fill the sessions table.
  const attemptLimiter = rateLimit({
    windowMs: env.LOGIN_RATE_LIMIT_WINDOW_MINUTES * 60_000,
    limit: env.LOGIN_ATTEMPT_LIMIT_MAX,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(new AppError('RATE_LIMITED', 429, 'Too many login attempts. Try again later.'));
    },
  });

  router.post('/login', attemptLimiter, loginLimiter, validate(loginSchemas), controller.postLogin);
  router.post('/logout', controller.postLogout);
  router.get('/me', createAuthenticate(prisma), controller.getMe);
  // Wrong current passwords count toward the same failed-attempt limit as logins.
  router.post(
    '/change-password',
    createAuthenticate(prisma),
    loginLimiter,
    validate(changePasswordSchemas),
    controller.postChangePassword,
  );
  return router;
}
