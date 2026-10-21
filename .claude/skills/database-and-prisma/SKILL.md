---
name: database-and-prisma
description: Prisma schema, migration, index, transaction and PostgreSQL guidance for Timesheets and Project Billing. Use when changing the schema, writing queries, or reasoning about data integrity and locking.
---

# Database and Prisma

## Schema design
- Model relations explicitly; choose `onDelete` deliberately (default `Restrict` for financial/audit data; no cascading deletes of time entries or audit logs). Prefer soft-state (status/archived) over deletion for projects and users.
- Use enums for statuses/roles. Add `@@unique` and `@@index` from real query patterns (e.g. `(userId, workDate)`, `(projectId, workDate)`), not guesses.
- Entry dates use `@db.Date` (no time zone). Timestamps use `timestamptz` (`DateTime`). Hours as `Decimal` (not Float).
- Map to snake_case with `@map`/`@@map`.
- Add DB `CHECK` constraints (e.g. hours > 0 and <= 24) via raw SQL in the migration when Prisma can't express them.

## Migrations
- Dev: `npx prisma migrate dev --name <change>`; review the generated SQL before applying.
- Never edit an applied migration; add a new one. Custom SQL (triggers, checks) lives in migration files and is documented in `docs/database-design.md`.
- Do not run `migrate reset` or destructive commands without explicit permission.

## Transactions and concurrency
- Wrap multi-step integrity operations in `prisma.$transaction`.
- For lock-vs-edit races: lock the period row (`SELECT ... FOR UPDATE` via `$queryRaw`) or rely on a DB trigger that checks the locked period; use appropriate isolation and test with concurrent operations.
- Do not claim database-level enforcement unless a trigger/constraint exists and a test hits it directly.

## Querying
- Use DB aggregation (`groupBy` or `$queryRaw` with parameters) for reports; never load all entries into memory.
- Always parameterize raw SQL (tagged template); never string-concatenate.
