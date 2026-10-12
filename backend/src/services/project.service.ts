import type { AuthUser } from '../auth/auth-user.js';
import { AppError } from '../errors/app-error.js';
import { isUniqueViolation } from '../errors/prisma-errors.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { compact } from '../utils/compact.js';
import { toIsoDate } from '../utils/dates.js';

interface ProjectRow {
  id: string;
  code: string;
  name: string;
  clientName: string | null;
  budgetHours: { toString(): string };
  startDate: Date | null;
  endDate: Date | null;
  isActive: boolean;
  tasks?: { id: string; name: string; isActive: boolean }[];
}

/**
 * `includeBudget` is true only for admins: allocated hours are commercial information (the budget
 * report is admin-only), and users logging time do not need them.
 */
export function toProjectView(project: ProjectRow, includeBudget = true) {
  return {
    id: project.id,
    code: project.code,
    name: project.name,
    clientName: project.clientName,
    ...(includeBudget && { budgetHours: Number(project.budgetHours) }),
    startDate: project.startDate ? toIsoDate(project.startDate) : null,
    endDate: project.endDate ? toIsoDate(project.endDate) : null,
    isActive: project.isActive,
    ...(project.tasks && {
      tasks: project.tasks.map((t) => ({ id: t.id, name: t.name, isActive: t.isActive })),
    }),
  };
}

const taskSelect = { id: true, name: true, isActive: true } as const;

function projectInclude(includeArchived: boolean) {
  return {
    tasks: {
      where: includeArchived ? {} : { isActive: true },
      select: taskSelect,
      orderBy: { name: 'asc' as const },
    },
  };
}

function assertDateRange(start: Date | null, end: Date | null): void {
  if (start && end && end < start) {
    throw new AppError('BUSINESS_RULE_VIOLATION', 422, 'endDate must not be before startDate');
  }
}

function assertCanSeeArchived(actor: AuthUser, includeArchived: boolean): void {
  if (includeArchived && actor.role !== 'ADMIN') {
    throw new AppError('FORBIDDEN', 403, 'Only admins can view archived projects');
  }
}

export async function listProjects(
  prisma: PrismaClient,
  actor: AuthUser,
  options: { includeArchived: boolean },
) {
  assertCanSeeArchived(actor, options.includeArchived);
  const projects = await prisma.project.findMany({
    where: options.includeArchived ? {} : { isActive: true },
    include: projectInclude(options.includeArchived),
    orderBy: { code: 'asc' },
  });
  return projects.map((p) => toProjectView(p, actor.role === 'ADMIN'));
}

export async function getProject(prisma: PrismaClient, actor: AuthUser, id: string) {
  const includeArchived = actor.role === 'ADMIN';
  const project = await prisma.project.findFirst({
    where: includeArchived ? { id } : { id, isActive: true },
    include: projectInclude(includeArchived),
  });
  if (!project) throw new AppError('NOT_FOUND', 404, 'Project not found');
  return toProjectView(project, actor.role === 'ADMIN');
}

export interface CreateProjectInput {
  code: string;
  name: string;
  clientName?: string | undefined;
  budgetHours: number;
  startDate?: Date | undefined;
  endDate?: Date | undefined;
}

export async function createProject(prisma: PrismaClient, input: CreateProjectInput) {
  assertDateRange(input.startDate ?? null, input.endDate ?? null);
  try {
    const project = await prisma.project.create({
      data: {
        code: input.code,
        name: input.name,
        budgetHours: input.budgetHours,
        ...compact({
          clientName: input.clientName,
          startDate: input.startDate,
          endDate: input.endDate,
        }),
      },
      include: projectInclude(true),
    });
    return toProjectView(project);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError('CONFLICT', 409, `Project code "${input.code}" already exists`);
    }
    throw error;
  }
}

export interface UpdateProjectInput {
  code?: string | undefined;
  name?: string | undefined;
  clientName?: string | null | undefined;
  budgetHours?: number | undefined;
  startDate?: Date | null | undefined;
  endDate?: Date | null | undefined;
  isActive?: boolean | undefined;
}

export async function updateProject(prisma: PrismaClient, id: string, patch: UpdateProjectInput) {
  const existing = await prisma.project.findUnique({ where: { id } });
  if (!existing) throw new AppError('NOT_FOUND', 404, 'Project not found');

  assertDateRange(
    patch.startDate === undefined ? existing.startDate : patch.startDate,
    patch.endDate === undefined ? existing.endDate : patch.endDate,
  );
  try {
    const project = await prisma.project.update({
      where: { id },
      data: compact({ ...patch }),
      include: projectInclude(true),
    });
    return toProjectView(project);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError('CONFLICT', 409, `Project code "${patch.code ?? ''}" already exists`);
    }
    throw error;
  }
}

export async function createTask(prisma: PrismaClient, projectId: string, name: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new AppError('NOT_FOUND', 404, 'Project not found');
  try {
    return await prisma.task.create({ data: { projectId, name }, select: taskSelect });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError('CONFLICT', 409, `Task "${name}" already exists in this project`);
    }
    throw error;
  }
}

export async function updateTask(
  prisma: PrismaClient,
  projectId: string,
  taskId: string,
  patch: { name?: string | undefined; isActive?: boolean | undefined },
) {
  const existing = await prisma.task.findFirst({ where: { id: taskId, projectId } });
  if (!existing) throw new AppError('NOT_FOUND', 404, 'Task not found');
  try {
    return await prisma.task.update({
      where: { id: taskId },
      data: compact({ ...patch }),
      select: taskSelect,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(
        'CONFLICT',
        409,
        `Task "${patch.name ?? ''}" already exists in this project`,
      );
    }
    throw error;
  }
}
