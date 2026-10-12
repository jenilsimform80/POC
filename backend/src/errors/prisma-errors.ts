import { Prisma } from '../generated/prisma/client.js';

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** SQLSTATE raised by our own PL/pgSQL triggers (see the period_lock_and_audit_guards migration). */
export const DB_PERIOD_LOCKED = 'LK001';
export const DB_AUDIT_APPEND_ONLY = 'LK002';

/** Extracts the original PostgreSQL SQLSTATE from a Prisma driver-adapter error, if any. */
export function postgresErrorCode(error: unknown): string | undefined {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return undefined;
  const meta = error.meta as
    { driverAdapterError?: { cause?: { originalCode?: unknown } } } | undefined;
  const code = meta?.driverAdapterError?.cause?.originalCode;
  return typeof code === 'string' ? code : undefined;
}
