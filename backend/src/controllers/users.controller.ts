import type { RequestHandler } from 'express';
import type { PrismaClient } from '../generated/prisma/client.js';
import { requireAuth } from '../middleware/authorize.js';
import { getValidated } from '../middleware/validate.js';
import {
  getVisibleUser,
  listDirectReports,
  listVisibleUsers,
} from '../services/authorization.service.js';
import { createUser, resetPassword, updateUser } from '../services/user.service.js';
import type {
  createUserSchemas,
  getUserSchemas,
  resetPasswordSchemas,
  updateUserSchemas,
} from '../validation/users.schemas.js';

export function createUsersController(prisma: PrismaClient) {
  const list: RequestHandler = async (req, res) => {
    res.status(200).json({ users: await listVisibleUsers(prisma, requireAuth(req)) });
  };

  const directReports: RequestHandler = async (req, res) => {
    res.status(200).json({ users: await listDirectReports(prisma, requireAuth(req)) });
  };

  const getById: RequestHandler = async (req, res) => {
    const { params } = getValidated<typeof getUserSchemas>(res);
    res.status(200).json({ user: await getVisibleUser(prisma, requireAuth(req), params.id) });
  };

  const create: RequestHandler = async (req, res) => {
    const { body } = getValidated<typeof createUserSchemas>(res);
    res.status(201).json({ user: await createUser(prisma, body) });
  };

  const update: RequestHandler = async (_req, res) => {
    const { params, body } = getValidated<typeof updateUserSchemas>(res);
    res.status(200).json({ user: await updateUser(prisma, params.id, body) });
  };

  const setPassword: RequestHandler = async (_req, res) => {
    const { params, body } = getValidated<typeof resetPasswordSchemas>(res);
    await resetPassword(prisma, params.id, body.password);
    res.status(204).end();
  };

  return { list, directReports, getById, create, update, setPassword };
}
