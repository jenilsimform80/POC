import type { RequestHandler } from 'express';
import type { Env } from '../config/env.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { getValidated } from '../middleware/validate.js';
import { requireAuth } from '../middleware/authorize.js';
import {
  login,
  logout,
  refresh,
  type LoginResult,
  type TokenOptions,
} from '../services/auth.service.js';
import { changeOwnPassword } from '../services/user.service.js';
import type {
  changePasswordSchemas,
  loginSchemas,
  logoutSchemas,
  refreshSchemas,
} from '../validation/auth.schemas.js';

/** The JSON body of a successful login or refresh. Tokens are returned only here, never logged. */
function tokenResponse(result: LoginResult) {
  return {
    user: result.user,
    tokenType: 'Bearer' as const,
    accessToken: result.accessToken,
    expiresIn: result.expiresIn,
    refreshToken: result.refreshToken,
    refreshTokenExpiresAt: result.refreshTokenExpiresAt.toISOString(),
  };
}

export function createAuthController(prisma: PrismaClient, env: Env) {
  const tokenOptions: TokenOptions = {
    jwtSecret: env.JWT_SECRET,
    accessTokenTtlMinutes: env.ACCESS_TOKEN_TTL_MINUTES,
    sessionTtlHours: env.SESSION_TTL_HOURS,
  };

  const postLogin: RequestHandler = async (_req, res) => {
    const { body } = getValidated<typeof loginSchemas>(res);
    res.status(200).json(tokenResponse(await login(prisma, body, tokenOptions)));
  };

  const postRefresh: RequestHandler = async (_req, res) => {
    const { body } = getValidated<typeof refreshSchemas>(res);
    res.status(200).json(tokenResponse(await refresh(prisma, body.refreshToken, tokenOptions)));
  };

  const postLogout: RequestHandler = async (_req, res) => {
    const { body } = getValidated<typeof logoutSchemas>(res);
    await logout(prisma, body.refreshToken);
    res.status(204).end();
  };

  const getMe: RequestHandler = (req, res) => {
    res.status(200).json({ user: requireAuth(req) });
  };

  const postChangePassword: RequestHandler = async (req, res) => {
    const { body } = getValidated<typeof changePasswordSchemas>(res);
    await changeOwnPassword(prisma, requireAuth(req).id, req.sessionId, body);
    res.status(204).end();
  };

  return { postLogin, postRefresh, postLogout, getMe, postChangePassword };
}
