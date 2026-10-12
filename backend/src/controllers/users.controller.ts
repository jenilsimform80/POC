import type { RequestHandler } from 'express';
import type { PrismaClient } from '../generated/prisma/client.js';
import { requireAuth } from '../middleware/authorize.js';
import { getValidated } from '../middleware/validate.js';
import {
  getVisibleUser,
  listDirectReports,
  listVisibleUsers,
} from '../services/authorization.service.js';
import type { getUserSchemas } from '../validation/users.schemas.js';

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

  return { list, directReports, getById };
}
