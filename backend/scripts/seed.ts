/**
 * Creates demo users for LOCAL DEVELOPMENT ONLY (idempotent: re-running updates the password).
 * Usage: SEED_PASSWORD='<choose one>' npm run db:seed
 * The password comes from the environment so no credential is committed to the repository.
 */
import { hashPassword } from '../src/auth/password.js';
import { loadEnv } from '../src/config/env.js';
import { createPrismaClient } from '../src/db/prisma.js';

const env = loadEnv();
if (env.NODE_ENV === 'production') throw new Error('Refusing to seed demo users in production.');

const password = process.env['SEED_PASSWORD'];
if (!password || password.length < 12) {
  throw new Error('Set SEED_PASSWORD to a value with at least 12 characters.');
}

const prisma = createPrismaClient(env.DATABASE_URL);

async function upsertUser(
  email: string,
  name: string,
  role: 'CONTRIBUTOR' | 'MANAGER' | 'ADMIN',
  managerId: string | null,
  passwordHash: string,
) {
  return prisma.user.upsert({
    where: { email },
    update: { name, role, managerId, passwordHash, isActive: true },
    create: { email, name, role, managerId, passwordHash },
  });
}

try {
  const passwordHash = await hashPassword(password);
  await upsertUser('admin@example.com', 'Alex Admin', 'ADMIN', null, passwordHash);
  const manager = await upsertUser(
    'manager@example.com',
    'Morgan Manager',
    'MANAGER',
    null,
    passwordHash,
  );
  await upsertUser('other.manager@example.com', 'Olive Manager', 'MANAGER', null, passwordHash);
  await upsertUser(
    'dev1@example.com',
    'Casey Contributor',
    'CONTRIBUTOR',
    manager.id,
    passwordHash,
  );
  await upsertUser('dev2@example.com', 'Drew Contributor', 'CONTRIBUTOR', manager.id, passwordHash);
  console.log(
    'Seeded 5 demo users (admin, 2 managers, 2 contributors). Password = $SEED_PASSWORD.',
  );
} finally {
  await prisma.$disconnect();
}
