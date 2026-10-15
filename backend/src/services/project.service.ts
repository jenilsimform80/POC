import type { AuthUser } from '../auth/auth-user.js';
import { AppError } from '../errors/app-error.js';
import { isUniqueViolation } from '../errors/prisma-errors.js';
import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { compact } from '../utils/compact.js';
import { toIsoDate } from '../utils/dates.js';
import type { Db } from './db-types.js';

interface ProjectRow {
  id: string;
  code: string;
  name: string;
  clientName: string | null;
  budgetHours: { toString(): string };
  startDate: Date | null;
  endDate: Date | null;
  isActive: boolean;
  isRestricted: boolean;
  members?: { userId: string }[];
  tasks?: TaskRow[];
}

interface TaskRow {
  id: string;
  name: string;
  isActive: boolean;
  createdById: string | null;
  assignees: { userId: string }[];
}

/**
 * Access rules in one place (same pattern as `visibleUsersWhere`): admins see everything; everyone
 * else sees open projects plus restricted projects they are a member of. Used as a query filter so
 * a hidden project is indistinguishable from a missing one (404, no IDOR leak).
 */
export function accessibleProjectsWhere(actor: AuthUser): Prisma.ProjectWhereInput {
  if (actor.role === 'ADMIN') return {};
  return { OR: [{ isRestricted: false }, { members: { some: { userId: actor.id } } }] };
}

/** A task with no assignees is open to everyone who can use the project. */
export function canLogToTask(actor: AuthUser, task: Pick<TaskRow, 'assignees'>): boolean {
  return (
    actor.role === 'ADMIN' ||
    task.assignees.length === 0 ||
    task.assignees.some((a) => a.userId === actor.id)
  );
}

/** Who may rename/archive/re-assign a task: admins always; managers only tasks they created. */
function canManageTask(actor: AuthUser, task: Pick<TaskRow, 'createdById'>): boolean {
  return actor.role === 'ADMIN' || (actor.role === 'MANAGER' && task.createdById === actor.id);
}

function toTaskView(actor: AuthUser, task: TaskRow) {
  const manageable = canManageTask(actor, task);
  return {
    id: task.id,
    name: task.name,
    isActive: task.isActive,
    canLog: canLogToTask(actor, task),
    canManage: manageable,
    // Who a task is assigned to is only shown to people who manage it.
    ...(manageable && { assigneeIds: task.assignees.map((a) => a.userId) }),
  };
}

/**
 * `includeBudget` is true only for admins: allocated hours are commercial information (the budget
 * report is admin-only), and users logging time do not need them.
 */
export function toProjectView(project: ProjectRow, actor: AuthUser) {
  const includeBudget = actor.role === 'ADMIN';
  return {
    id: project.id,
    code: project.code,
    name: project.name,
    clientName: project.clientName,
    ...(includeBudget && { budgetHours: Number(project.budgetHours) }),
    startDate: project.startDate ? toIsoDate(project.startDate) : null,
    endDate: project.endDate ? toIsoDate(project.endDate) : null,
    isActive: project.isActive,
    isRestricted: project.isRestricted,
    // The member list is administrative information.
    ...(actor.role === 'ADMIN' &&
      project.members && { memberIds: project.members.map((m) => m.userId) }),
    ...(project.tasks && { tasks: project.tasks.map((t) => toTaskView(actor, t)) }),
  };
}

const taskSelect = {
  id: true,
  name: true,
  isActive: true,
  createdById: true,
  assignees: { select: { userId: true } },
} as const;

function projectInclude(actor: AuthUser, includeArchived: boolean) {
  return {
    tasks: {
      where: includeArchived ? {} : { isActive: true },
      select: taskSelect,
      orderBy: { name: 'asc' as const },
    },
    ...(actor.role === 'ADMIN' && { members: { select: { userId: true } } }),
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
    where: {
      AND: [accessibleProjectsWhere(actor), options.includeArchived ? {} : { isActive: true }],
    },
    include: projectInclude(actor, options.includeArchived),
    orderBy: { code: 'asc' },
  });
  return projects.map((p) => toProjectView(p, actor));
}

export async function getProject(prisma: PrismaClient, actor: AuthUser, id: string) {
  const includeArchived = actor.role === 'ADMIN';
  const project = await prisma.project.findFirst({
    where: {
      AND: [{ id }, accessibleProjectsWhere(actor), includeArchived ? {} : { isActive: true }],
    },
    include: projectInclude(actor, includeArchived),
  });
  if (!project) throw new AppError('NOT_FOUND', 404, 'Project not found');
  return toProjectView(project, actor);
}

export interface CreateProjectInput {
  code: string;
  name: string;
  clientName?: string | undefined;
  budgetHours: number;
  startDate?: Date | undefined;
  endDate?: Date | undefined;
  isRestricted?: boolean | undefined;
  memberIds?: string[] | undefined;
}

const rule = (message: string) => new AppError('BUSINESS_RULE_VIOLATION', 422, message);

/** Members must be real, active, non-admin users (admins already see every project). */
async function assertMembersValid(tx: Db, userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;
  const count = await tx.user.count({
    where: { id: { in: userIds }, isActive: true, role: { not: 'ADMIN' } },
  });
  if (count !== new Set(userIds).size)
    throw rule('memberIds must be active contributors or managers');
}

export async function createProject(
  prisma: PrismaClient,
  actor: AuthUser,
  input: CreateProjectInput,
) {
  assertDateRange(input.startDate ?? null, input.endDate ?? null);
  const memberIds = [...new Set(input.memberIds ?? [])];
  if (memberIds.length > 0 && !input.isRestricted) {
    throw rule('memberIds only apply to a restricted project');
  }
  try {
    const project = await prisma.$transaction(async (tx) => {
      await assertMembersValid(tx, memberIds);
      return tx.project.create({
        data: {
          code: input.code,
          name: input.name,
          budgetHours: input.budgetHours,
          isRestricted: input.isRestricted ?? false,
          members: { create: memberIds.map((userId) => ({ userId })) },
          ...compact({
            clientName: input.clientName,
            startDate: input.startDate,
            endDate: input.endDate,
          }),
        },
        include: projectInclude(actor, true),
      });
    });
    return toProjectView(project, actor);
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
  isRestricted?: boolean | undefined;
  /** Replaces the whole member list when present. */
  memberIds?: string[] | undefined;
}

export async function updateProject(
  prisma: PrismaClient,
  actor: AuthUser,
  id: string,
  patch: UpdateProjectInput,
) {
  const existing = await prisma.project.findUnique({ where: { id } });
  if (!existing) throw new AppError('NOT_FOUND', 404, 'Project not found');

  assertDateRange(
    patch.startDate === undefined ? existing.startDate : patch.startDate,
    patch.endDate === undefined ? existing.endDate : patch.endDate,
  );
  const { memberIds, ...fields } = patch;
  const members = memberIds === undefined ? undefined : [...new Set(memberIds)];
  if (members && members.length > 0 && !(patch.isRestricted ?? existing.isRestricted)) {
    throw rule('memberIds only apply to a restricted project');
  }
  try {
    const project = await prisma.$transaction(async (tx) => {
      if (members) {
        await assertMembersValid(tx, members);
        await tx.projectMember.deleteMany({ where: { projectId: id } });
        await tx.projectMember.createMany({
          data: members.map((userId) => ({ projectId: id, userId })),
        });
      }
      return tx.project.update({
        where: { id },
        data: compact({ ...fields }),
        include: projectInclude(actor, true),
      });
    });
    return toProjectView(project, actor);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError('CONFLICT', 409, `Project code "${patch.code ?? ''}" already exists`);
    }
    throw error;
  }
}

/** The project must be visible to the actor (else 404) and, for non-admins, still active. */
async function findProjectForTaskWork(db: Db, actor: AuthUser, projectId: string) {
  const project = await db.project.findFirst({
    where: { AND: [{ id: projectId }, accessibleProjectsWhere(actor)] },
    select: { id: true, isActive: true, isRestricted: true },
  });
  if (!project) throw new AppError('NOT_FOUND', 404, 'Project not found');
  if (!project.isActive && actor.role !== 'ADMIN') {
    throw rule('Project is archived; tasks cannot be changed');
  }
  return project;
}

/**
 * Assignees must be active non-admin users. A manager may only assign themself or their own active
 * direct reports; on a restricted project every assignee must also be a member (otherwise the
 * assignment would be useless: they could not log time there).
 */
async function assertAssigneesValid(
  tx: Db,
  actor: AuthUser,
  project: { id: string; isRestricted: boolean },
  assigneeIds: string[],
): Promise<void> {
  if (assigneeIds.length === 0) return;
  const unique = [...new Set(assigneeIds)];
  const users = await tx.user.findMany({
    where: {
      id: { in: unique },
      isActive: true,
      role: { not: 'ADMIN' },
      ...(actor.role === 'MANAGER' && { OR: [{ id: actor.id }, { managerId: actor.id }] }),
      ...(project.isRestricted && { projectMemberships: { some: { projectId: project.id } } }),
    },
    select: { id: true },
  });
  if (users.length !== unique.length) {
    throw rule(
      actor.role === 'MANAGER'
        ? 'assigneeIds must be you or your active direct reports who can use this project'
        : 'assigneeIds must be active project members',
    );
  }
}

export async function createTask(
  prisma: PrismaClient,
  actor: AuthUser,
  projectId: string,
  input: { name: string; assigneeIds?: string[] | undefined },
) {
  try {
    const task = await prisma.$transaction(async (tx) => {
      const project = await findProjectForTaskWork(tx, actor, projectId);
      const assigneeIds = [...new Set(input.assigneeIds ?? [])];
      await assertAssigneesValid(tx, actor, project, assigneeIds);
      return tx.task.create({
        data: {
          projectId,
          name: input.name,
          createdById: actor.role === 'ADMIN' ? null : actor.id,
          assignees: { create: assigneeIds.map((userId) => ({ userId })) },
        },
        select: taskSelect,
      });
    });
    return toTaskView(actor, task);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError('CONFLICT', 409, `Task "${input.name}" already exists in this project`);
    }
    throw error;
  }
}

export async function updateTask(
  prisma: PrismaClient,
  actor: AuthUser,
  projectId: string,
  taskId: string,
  patch: {
    name?: string | undefined;
    isActive?: boolean | undefined;
    /** Replaces the whole assignee list when present; an empty list opens the task to everyone. */
    assigneeIds?: string[] | undefined;
  },
) {
  const { assigneeIds, ...fields } = patch;
  try {
    const task = await prisma.$transaction(async (tx) => {
      const project = await findProjectForTaskWork(tx, actor, projectId);
      const existing = await tx.task.findFirst({
        where: { id: taskId, projectId },
        select: taskSelect,
      });
      if (!existing) throw new AppError('NOT_FOUND', 404, 'Task not found');
      // A task you may not manage looks the same as one that does not exist for you.
      if (!canManageTask(actor, existing))
        throw new AppError('FORBIDDEN', 403, 'You can only change tasks you created');

      if (assigneeIds) {
        const unique = [...new Set(assigneeIds)];
        await assertAssigneesValid(tx, actor, project, unique);
        await tx.taskAssignee.deleteMany({ where: { taskId } });
        await tx.taskAssignee.createMany({ data: unique.map((userId) => ({ taskId, userId })) });
      }
      return tx.task.update({
        where: { id: taskId },
        data: compact({ ...fields }),
        select: taskSelect,
      });
    });
    return toTaskView(actor, task);
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
