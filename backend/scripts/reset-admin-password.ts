/**
 * Recovery for a forgotten ADMIN password (the HTTP API deliberately cannot reset admins).
 * Needs shell access to the server and its DATABASE_URL, which is the security boundary.
 *
 * Usage: npm run admin:reset-password -- admin@example.com
 * The new password is typed at a hidden prompt (or read from RESET_PASSWORD for automation), so
 * it never lands in shell history. All of the user's sessions end, and the reset is audited.
 */
import { createInterface } from 'node:readline';
import { hashPassword } from '../src/auth/password.js';
import { loadEnv } from '../src/config/env.js';
import { createPrismaClient } from '../src/db/prisma.js';
import { recordAudit } from '../src/services/audit.service.js';
import { MIN_PASSWORD_LENGTH } from '../src/validation/common.js';

function readHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const write = (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput;
    let asked = false;
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
      if (!asked) write.call(rl, s); // show the question, then stay silent while typing
      if (s.includes(question)) asked = true;
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

const email = process.argv[2]?.trim().toLowerCase();
if (!email) throw new Error('Usage: npm run admin:reset-password -- <email>');

const env = loadEnv();
const prisma = createPrismaClient(env.DATABASE_URL);

try {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true, name: true },
  });
  if (!user) throw new Error(`No user with email ${email}`);

  const password = process.env['RESET_PASSWORD'] ?? (await readHidden('New password: '));
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`The password needs at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (!process.env['RESET_PASSWORD'] && (await readHidden('Repeat password: ')) !== password) {
    throw new Error('The passwords do not match.');
  }

  const passwordHash = await hashPassword(password);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash, mustChangePassword: false },
    });
    await tx.session.deleteMany({ where: { userId: user.id } });
    // The audit table needs an actor that exists; there is no signed-in user, so the account
    // itself is recorded, with `via` showing it came from the command line.
    await recordAudit(tx, {
      actorId: user.id,
      action: 'PASSWORD_RESET',
      entityType: 'user',
      entityId: user.id,
      metadata: { via: 'cli' },
    });
  });
  console.log(`Password reset for ${user.name} (${user.role}). All their sessions were ended.`);
} finally {
  await prisma.$disconnect();
}
