import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthUser } from '../src/auth/auth-user.js';
import { AppError } from '../src/errors/app-error.js';
import { assertCanDecideSubmission } from '../src/services/authorization.service.js';
import { createTestPrisma, createUser, resetDatabase } from './helpers.js';

// The approve/reject HTTP endpoints arrive in Phase 4. Until then the rule is verified at the
// service level against real data; Phase 4 must add HTTP-level tests that call this same function.
const prisma = createTestPrisma();

let managerA: AuthUser;
let managerB: AuthUser;
let admin: AuthUser;
let owner: AuthUser;
let colleague: AuthUser;
let submissionId: string;

const asAuthUser = (u: {
  id: string;
  email: string;
  name: string;
  role: AuthUser['role'];
  managerId: string | null;
}): AuthUser => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  managerId: u.managerId,
});

async function failureOf(actor: AuthUser, id = submissionId): Promise<AppError> {
  const error = await assertCanDecideSubmission(prisma, actor, id).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
}

beforeAll(async () => {
  await resetDatabase(prisma);
  managerA = asAuthUser(await createUser(prisma, { email: 'ma@t.dev', role: 'MANAGER' }));
  managerB = asAuthUser(await createUser(prisma, { email: 'mb@t.dev', role: 'MANAGER' }));
  admin = asAuthUser(await createUser(prisma, { email: 'admin@t.dev', role: 'ADMIN' }));
  owner = asAuthUser(await createUser(prisma, { email: 'dev@t.dev', managerId: managerA.id }));
  colleague = asAuthUser(await createUser(prisma, { email: 'col@t.dev', managerId: managerA.id }));
  const submission = await prisma.weeklySubmission.create({
    data: { userId: owner.id, weekStart: new Date('2026-03-02T00:00:00.000Z') },
  });
  submissionId = submission.id;
});
afterAll(async () => {
  await resetDatabase(prisma);
  await prisma.$disconnect();
});

describe('assertCanDecideSubmission', () => {
  it("allows the owner's direct manager", async () => {
    const submission = await assertCanDecideSubmission(prisma, managerA, submissionId);

    expect(submission.id).toBe(submissionId);
  });

  it('refuses a manager who is not the owner’s manager (404, no existence leak)', async () => {
    const error = await failureOf(managerB);

    expect(error.status).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
  });

  it('gives the same answer for a missing submission as for a foreign one', async () => {
    const foreign = await failureOf(managerB);
    const missing = await failureOf(managerB, '22222222-2222-4222-8222-222222222222');

    expect({ status: missing.status, message: missing.message }).toEqual({
      status: foreign.status,
      message: foreign.message,
    });
  });

  it.each([
    ['an admin', () => admin],
    ['the contributor who owns it', () => owner],
    ['a colleague contributor', () => colleague],
  ])('refuses %s with 403', async (_label, actor) => {
    const error = await failureOf(actor());

    expect(error.status).toBe(403);
    expect(error.code).toBe('FORBIDDEN');
  });

  it('follows the current reporting line: after reassignment the old manager is refused', async () => {
    await prisma.user.update({ where: { id: owner.id }, data: { managerId: managerB.id } });

    expect((await failureOf(managerA)).status).toBe(404);
    expect((await assertCanDecideSubmission(prisma, managerB, submissionId)).id).toBe(submissionId);

    await prisma.user.update({ where: { id: owner.id }, data: { managerId: managerA.id } });
  });
});
