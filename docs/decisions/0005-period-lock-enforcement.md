# 0005. Period locking: two enforcement layers and a shared/exclusive advisory lock

Status: Accepted (Phase 5). Policy values are ASSUMPTIONS (original spec unverified).

## Policy
- **Unit:** one global calendar month (`locked_periods.period_start` = first of month, unique). A time entry is locked iff a row exists for the month of its `work_date`.
- **Protected data:** `time_entries`. A locked month's entries cannot be created, changed (any field, including notes), deleted, moved *out of* it or moved *into* it.
- **Who:** only ADMIN locks and unlocks; admins are **not** exempt from the lock themselves. Everyone signed in may list locked months.
- **Unlock:** allowed, admin only, reason (≥ 3 chars) mandatory. The lock row is deleted; history lives in the append-only audit trail (`PERIOD_LOCKED` with an entry/hours snapshot, `PERIOD_UNLOCKED` with the reason).
- **Workflow side effect:** rejecting a submission reopens its week for editing, so it is refused (409 `PERIOD_LOCKED`) when any day of that week is in a locked month. Approving is still allowed. Submitting is unaffected (it does not change entries).
- **Audit:** submit, approve, reject, lock, unlock each write an `audit_logs` row *in the same transaction* as the action. `audit_logs` is append-only (DB trigger, SQLSTATE `LK002`). Read access: `GET /api/audit-logs`, admin only.

## Enforcement layers
1. **Service layer** (`assertDatesUnlocked`, called by create/update/delete entry): friendly 409 with `details.enforcedBy = "service"`; the first line of defence for all API traffic.
2. **Database trigger** (`time_entries_period_lock`, migration `20261011160000_period_lock_and_audit_guards`): fires `BEFORE INSERT OR UPDATE OR DELETE`, checks the old and new month, raises SQLSTATE `LK001`. Covers every other path (scripts, future code, `psql`). If it ever fires through the API it is mapped to the same 409 with `enforcedBy = "database"`.

## The race, and why both layers share one lock
Under READ COMMITTED an edit cannot see a lock row that another transaction inserted but has not committed. "Check, then write" would let this happen: the lock commits, then the in-flight edit commits, changing a locked month. Fix: one advisory lock per month (`hashtextextended('period_lock:YYYY-MM', 0)`):
- every entry write takes it **shared** (trigger and service) *before* looking for a lock row;
- lock/unlock takes it **exclusive**: it waits for in-flight edits of that month to commit, and new edits wait until the lock row is committed, after which their check sees it.
No deadlock is possible: the exclusive holder takes only that one lock; edit transactions take the per-user lock (ADR 0004) first and period locks second, in sorted order.

## Evidence (tests, `backend/tests/period-lock.test.ts`, mutation-checked)
- API: create/update/delete/move rejected with `enforcedBy: "service"`; other users' entries refused first (404/403) without leaking lock state.
- Database: raw SQL `INSERT/UPDATE/DELETE` (and ORM `update/delete/deleteMany`) rejected with SQLSTATE `LK001`, without any application code involved.
- Races: (a) a lock waits for an uncommitted raw write and its snapshot includes it; (b) a write started while the lock is uncommitted waits, then is rejected by both layers; (c) 8 rounds × 8 concurrent creates racing a lock: the count of entries after the run equals the count frozen at lock time; (d) three concurrent lock requests: exactly one wins.
- Removing the trigger's shared lock fails (a) and (b); dropping the trigger fails the DB-layer tests and (a)/(b) while the API tests still pass; disabling the service check fails the `enforcedBy: "service"` assertions.

## Limits (verified, not assumed)
- The role that **owns the tables** (the app role in this POC) can `ALTER TABLE ... DISABLE TRIGGER` and `TRUNCATE` (row triggers do not fire for TRUNCATE). So the trigger stops application code and ordinary SQL, **not** a DBA or a compromised owner role. Production hardening: separate the migration/owner role from a least-privilege application role (no ALTER/TRUNCATE), and optionally add statement-level TRUNCATE triggers.
- Locks are per calendar month, not per project or arbitrary range. Entries created *before* a lock is placed are not re-validated.

## Alternatives considered
- Service check only (rejected: bypassable, and racy without the lock). Trigger only (rejected: poor error messages, no workflow rules). `SERIALIZABLE` + retry (works but complicates every write path). Row lock on `locked_periods` (cannot lock a row that does not exist yet). Soft-unlock flag instead of deleting the row (more state; the audit trail already records history).
