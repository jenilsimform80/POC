import type { CookieOptions, RequestHandler } from 'express';
import { sessionCookieName } from '../auth/session.service.js';
import type { Env } from '../config/env.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { getValidated } from '../middleware/validate.js';
import { requireAuth } from '../middleware/authorize.js';
import { login, logout } from '../services/auth.service.js';
import type { loginSchemas } from '../validation/auth.schemas.js';

function cookieOptions(env: Env): CookieOptions {
  return {
    httpOnly: true, // not readable from JavaScript (limits XSS impact)
    sameSite: 'lax', // not sent on cross-site POSTs (CSRF)
    secure: env.NODE_ENV === 'production', // HTTPS only in production
    path: '/',
  };
}

export function createAuthController(prisma: PrismaClient, env: Env) {
  const SESSION_COOKIE = sessionCookieName(env.NODE_ENV);
  const postLogin: RequestHandler = async (req, res) => {
    const { body } = getValidated<typeof loginSchemas>(res);
    const previousToken = (req.cookies as Record<string, unknown> | undefined)?.[SESSION_COOKIE];
    const result = await login(prisma, body, {
      sessionTtlHours: env.SESSION_TTL_HOURS,
      previousToken: typeof previousToken === 'string' ? previousToken : undefined,
    });
    res.cookie(SESSION_COOKIE, result.token, { ...cookieOptions(env), expires: result.expiresAt });
    res.status(200).json({ user: result.user });
  };

  const postLogout: RequestHandler = async (req, res) => {
    const token = (req.cookies as Record<string, unknown> | undefined)?.[SESSION_COOKIE];
    await logout(prisma, typeof token === 'string' ? token : undefined);
    res.clearCookie(SESSION_COOKIE, cookieOptions(env));
    res.status(204).end();
  };

  const getMe: RequestHandler = (req, res) => {
    res.status(200).json({ user: requireAuth(req) });
  };

  return { postLogin, postLogout, getMe };
}
