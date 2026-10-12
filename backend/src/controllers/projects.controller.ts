import type { RequestHandler } from 'express';
import type { PrismaClient } from '../generated/prisma/client.js';
import { requireAuth } from '../middleware/authorize.js';
import { getValidated } from '../middleware/validate.js';
import * as projects from '../services/project.service.js';
import type {
  createProjectSchemas,
  createTaskSchemas,
  listProjectsSchemas,
  projectIdSchemas,
  updateProjectSchemas,
  updateTaskSchemas,
} from '../validation/projects.schemas.js';

export function createProjectsController(prisma: PrismaClient) {
  const list: RequestHandler = async (req, res) => {
    const { query } = getValidated<typeof listProjectsSchemas>(res);
    const result = await projects.listProjects(prisma, requireAuth(req), {
      includeArchived: query.includeArchived ?? false,
    });
    res.status(200).json({ projects: result });
  };

  const get: RequestHandler = async (req, res) => {
    const { params } = getValidated<typeof projectIdSchemas>(res);
    res
      .status(200)
      .json({ project: await projects.getProject(prisma, requireAuth(req), params.id) });
  };

  const create: RequestHandler = async (_req, res) => {
    const { body } = getValidated<typeof createProjectSchemas>(res);
    res.status(201).json({ project: await projects.createProject(prisma, body) });
  };

  const update: RequestHandler = async (_req, res) => {
    const { params, body } = getValidated<typeof updateProjectSchemas>(res);
    res.status(200).json({ project: await projects.updateProject(prisma, params.id, body) });
  };

  const addTask: RequestHandler = async (_req, res) => {
    const { params, body } = getValidated<typeof createTaskSchemas>(res);
    res.status(201).json({ task: await projects.createTask(prisma, params.id, body.name) });
  };

  const patchTask: RequestHandler = async (_req, res) => {
    const { params, body } = getValidated<typeof updateTaskSchemas>(res);
    res
      .status(200)
      .json({ task: await projects.updateTask(prisma, params.id, params.taskId, body) });
  };

  return { list, get, create, update, addTask, patchTask };
}
