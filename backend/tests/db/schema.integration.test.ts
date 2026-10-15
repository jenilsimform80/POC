import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Prisma } from '../../src/generated/prisma/client.js';
import { createTestPrisma } from '../db-helper.js';

const prisma = createTestPrisma();

async function resetTables(): Promise<void> {
  // Children first: every FK is ON DELETE RESTRICT.
  await prisma.$executeRaw`TRUNCATE TABLE audit_logs`; // append-only: DELETE is blocked by trigger
  await prisma.approval.deleteMany();
  await prisma.weeklySubmission.deleteMany();
  await prisma.lockedPeriod.deleteMany();
  await prisma.timeEntry.deleteMany();
  await prisma.task.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany({ where: { managerId: { not: null } } });
  await prisma.user.deleteMany();
}

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

async function seed() {
  const manager = await prisma.user.create({
    data: { email: 'manager@test.dev', name: 'Mia Manager', passwordHash: 'x', role: 'MANAGER' },
  });
  const user = await prisma.user.create({
    data: { email: 'dev@test.dev', name: 'Dev', passwordHash: 'x', managerId: manager.id },
  });
  const project = await prisma.project.create({
    data: { code: 'P-1', name: 'Alpha', budgetHours: 100 },
  });
  const task = await prisma.task.create({ data: { projectId: project.id, name: 'Build' } });
  return { manager, user, project, task };
}

beforeEach(resetTables);
afterAll(async () => {
  await resetTables();
  await prisma.$disconnect();
});

describe('database connectivity and schema', () => {
  it('answers a query and has every expected table', async () => {
    const rows = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name <> '_prisma_migrations'
      ORDER BY table_name`;

    expect(rows.map((r) => r.table_name)).toEqual([
      'approvals',
      'audit_logs',
      'locked_periods',
      'project_members',
      'projects',
      'sessions',
      'task_assignees',
      'tasks',
      'time_entries',
      'users',
      'weekly_submissions',
    ]);
  });

  it('stores a full object graph and preserves dates and decimals', async () => {
    const { manager, user, project, task } = await seed();
    const entry = await prisma.timeEntry.create({
      data: {
        userId: user.id,
        projectId: project.id,
        taskId: task.id,
        workDate: day('2026-03-02'),
        hours: '7.50',
        isBillable: true,
      },
    });
    const submission = await prisma.weeklySubmission.create({
      data: { userId: user.id, weekStart: day('2026-03-02') },
    });
    await prisma.approval.create({
      data: { submissionId: submission.id, managerId: manager.id, decision: 'APPROVED' },
    });
    await prisma.auditLog.create({
      data: {
        actorId: manager.id,
        action: 'SUBMISSION_APPROVED',
        entityType: 'weekly_submission',
        entityId: submission.id,
        metadata: { weekStart: '2026-03-02' },
      },
    });

    const loaded = await prisma.timeEntry.findUniqueOrThrow({
      where: { id: entry.id },
      include: { user: { include: { manager: true } } },
    });
    expect(loaded.hours.toString()).toBe('7.5');
    expect(loaded.workDate.toISOString().slice(0, 10)).toBe('2026-03-02');
    expect(loaded.user.manager?.id).toBe(manager.id);
  });
});

describe('integrity constraints', () => {
  it('rejects hours of 0 or more than 24 (CHECK)', async () => {
    const { user, project, task } = await seed();
    const base = {
      userId: user.id,
      projectId: project.id,
      taskId: task.id,
      workDate: day('2026-03-02'),
      isBillable: false,
    };

    await expect(prisma.timeEntry.create({ data: { ...base, hours: 0 } })).rejects.toThrow();
    await expect(prisma.timeEntry.create({ data: { ...base, hours: '24.01' } })).rejects.toThrow();
    expect(await prisma.timeEntry.count()).toBe(0);
  });

  it('rejects an entry whose task belongs to a different project (composite FK)', async () => {
    const { user, task } = await seed();
    const other = await prisma.project.create({
      data: { code: 'P-2', name: 'Beta', budgetHours: 10 },
    });

    await expect(
      prisma.timeEntry.create({
        data: {
          userId: user.id,
          projectId: other.id,
          taskId: task.id,
          workDate: day('2026-03-02'),
          hours: 1,
          isBillable: true,
        },
      }),
    ).rejects.toThrow();
  });

  it('allows only one submission per user per week', async () => {
    const { user } = await seed();
    await prisma.weeklySubmission.create({
      data: { userId: user.id, weekStart: day('2026-03-02') },
    });

    const error = await prisma.weeklySubmission
      .create({ data: { userId: user.id, weekStart: day('2026-03-02') } })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect((error as Prisma.PrismaClientKnownRequestError).code).toBe('P2002');
  });

  it('requires week_start to be a Monday', async () => {
    const { user } = await seed();

    await expect(
      prisma.weeklySubmission.create({ data: { userId: user.id, weekStart: day('2026-03-03') } }),
    ).rejects.toThrow();
  });

  it('requires a locked period to start on the first day of a month', async () => {
    const { manager } = await seed();

    await expect(
      prisma.lockedPeriod.create({
        data: { periodStart: day('2026-03-15'), lockedById: manager.id },
      }),
    ).rejects.toThrow();
    await prisma.lockedPeriod.create({
      data: { periodStart: day('2026-03-01'), lockedById: manager.id },
    });
    await expect(
      prisma.lockedPeriod.create({
        data: { periodStart: day('2026-03-01'), lockedById: manager.id },
      }),
    ).rejects.toThrow();
  });

  it('rejects a user being their own manager', async () => {
    const { user } = await seed();

    await expect(
      prisma.user.update({ where: { id: user.id }, data: { managerId: user.id } }),
    ).rejects.toThrow();
  });

  it('rejects a negative project budget or an end date before the start date', async () => {
    await expect(
      prisma.project.create({ data: { code: 'P-9', name: 'Bad', budgetHours: -1 } }),
    ).rejects.toThrow();
    await expect(
      prisma.project.create({
        data: {
          code: 'P-8',
          name: 'Bad dates',
          budgetHours: 1,
          startDate: day('2026-05-01'),
          endDate: day('2026-04-01'),
        },
      }),
    ).rejects.toThrow();
  });

  it('restricts deleting a user, project or task that is referenced', async () => {
    const { user, project, task } = await seed();
    await prisma.timeEntry.create({
      data: {
        userId: user.id,
        projectId: project.id,
        taskId: task.id,
        workDate: day('2026-03-02'),
        hours: 1,
        isBillable: true,
      },
    });

    for (const attempt of [
      () => prisma.user.delete({ where: { id: user.id } }),
      () => prisma.project.delete({ where: { id: project.id } }),
      () => prisma.task.delete({ where: { id: task.id } }),
    ]) {
      const error = await attempt().catch((e: unknown) => e);
      expect((error as Prisma.PrismaClientKnownRequestError).code).toBe('P2003');
    }
    expect(await prisma.timeEntry.count()).toBe(1);
  });
});
