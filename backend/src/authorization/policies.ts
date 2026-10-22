import type { AuthUser } from '../auth/auth-user.js';
import { Prisma } from '../generated/prisma/client.js';

/**
 * Authorization rules in one place.
 *
 * - CONTRIBUTOR: only their own records.
 * - MANAGER: their own records and those of users whose `managerId` is them (direct reports).
 * - ADMIN (Admin/Finance): may view every user and lock periods; admins approve timesheets only
 *   as a fallback, when the owner has no usable manager (ADR 0016), never their own.
 *
 * Rules are expressed as Prisma `where` filters so the database enforces scope in the same query
 * that fetches the record (no "fetch by id, then check" gap - the IDOR-safe pattern).
 */
export function visibleUsersWhere(actor: AuthUser): Prisma.UserWhereInput {
  switch (actor.role) {
    case 'ADMIN':
      return {};
    case 'MANAGER':
      return { OR: [{ id: actor.id }, { managerId: actor.id }] };
    case 'CONTRIBUTOR':
      return { id: actor.id };
  }
}

/** Submissions and time entries are visible to whoever may see their owner. */
export function ownedByVisibleUser(actor: AuthUser): { user: Prisma.UserWhereInput } {
  return { user: visibleUsersWhere(actor) };
}

/**
 * The same visibility rule as `visibleUsersWhere`, as a SQL fragment for aggregate queries that
 * cannot go through the ORM. `entryAlias` is a fixed identifier chosen by the caller, never user
 * input; every value is bound as a parameter.
 *
 * The manager rule is written as `user_id IN (subquery)` rather than `user_id = me OR
 * users.manager_id = me`: the OR defeats the (user_id, work_date) index and forced a sequential
 * scan; the IN form is an index scan and ~3x faster on 600k rows (EXPLAIN, ADR 0007).
 */
export function visibleEntriesSql(actor: AuthUser, entryAlias: Prisma.Sql): Prisma.Sql {
  switch (actor.role) {
    case 'ADMIN':
      return Prisma.sql`TRUE`;
    case 'MANAGER':
      return Prisma.sql`${entryAlias}.user_id IN (
        SELECT id FROM users WHERE id = ${actor.id}::uuid OR manager_id = ${actor.id}::uuid)`;
    case 'CONTRIBUTOR':
      return Prisma.sql`${entryAlias}.user_id = ${actor.id}::uuid`;
  }
}
