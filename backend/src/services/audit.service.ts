import type { AuthUser } from '../auth/auth-user.js';
import type { AuditAction, Prisma, PrismaClient } from '../generated/prisma/client.js';
import type { Db } from './db-types.js';

export interface AuditEvent {
  actorId: string;
  action: AuditAction;
  entityType: 'weekly_submission' | 'locked_period' | 'user';
  entityId: string;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Writes one audit row. Callers pass their transaction client so the audit record commits (or
 * rolls back) together with the action it describes: no action without a record, no record
 * without an action. The table is append-only at the database level (migration trigger).
 */
export async function recordAudit(db: Db, event: AuditEvent): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: event.actorId,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId,
      ...(event.metadata !== undefined && { metadata: event.metadata }),
    },
  });
}

export async function listAuditLogs(
  prisma: PrismaClient,
  _actor: AuthUser,
  filter: {
    action?: AuditAction | undefined;
    entityType?: string | undefined;
    entityId?: string | undefined;
    actorId?: string | undefined;
    limit: number;
    offset: number;
  },
) {
  const logs = await prisma.auditLog.findMany({
    where: {
      ...(filter.action && { action: filter.action }),
      ...(filter.entityType && { entityType: filter.entityType }),
      ...(filter.entityId && { entityId: filter.entityId }),
      ...(filter.actorId && { actorId: filter.actorId }),
    },
    include: { actor: { select: { id: true, name: true, email: true } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    take: filter.limit,
    skip: filter.offset,
  });
  return logs.map((log) => ({
    id: log.id,
    action: log.action,
    entityType: log.entityType,
    entityId: log.entityId,
    metadata: log.metadata,
    createdAt: log.createdAt,
    actor: log.actor,
  }));
}
