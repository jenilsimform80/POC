# 0004. Timesheet workflow rules and per-user write serialization

Status: Accepted (Phase 4). All rule values are ASSUMPTIONS: the original spec is unverified (see `docs/requirements.md`).

## Decisions
- **Hours:** one entry is > 0 and ≤ 24 h in 0.25 h steps (DB CHECK + validation). A user's total for one day may not exceed 24 h (hard 422 `DAILY_LIMIT_EXCEEDED`). Warnings (never blocking) above 10 h/day and 48 h/week are returned in write responses and the week summary. Thresholds live in `src/services/timesheet-rules.ts`.
- **Week lifecycle:** no submission row = DRAFT (editable) → `SUBMITTED` (frozen) → `APPROVED` (frozen) or `REJECTED` (editable again; resubmitting moves the same row back to SUBMITTED). Frozen means create, update and delete of entries whose date is in that week are refused with 409 `WEEK_NOT_EDITABLE`; moving an entry out of or into a frozen week is refused too. There is no "recall" action: a mistaken submission is corrected by the manager rejecting it.
- **Submitting:** only your own week; the week must contain at least one entry; you must have an assigned manager who is an active user with role MANAGER (otherwise nobody could approve it and the week would stay frozen forever; refused with 422).
- **Deciding:** only role MANAGER and only the submission owner's *current* direct manager (ADR 0003 rules). Reject requires a comment. Each decision is appended to `approvals`; the submission row holds the current status.
- **Projects/tasks:** admin creates, edits and archives (no deletion); everyone signed in reads active ones. New entries require an active project, an active task of that project, and a date inside the project's start/end window if set.
- **Entry updates:** project/task/date-window validity is re-checked only when the project, task or date changes. Otherwise archiving a project would make hours/notes of an existing (e.g. rejected) entry impossible to correct.
- **Entry mutation:** only the owner may update or delete an entry. A manager or admin who can *see* it gets 403; someone who cannot see it gets 404.

## Concurrency
Every write that depends on a sum or on a week's status (create/update/delete entry, submit, decide) runs in one transaction that first takes `pg_advisory_xact_lock(hashtextextended(userId, 0))`. Writes of the same user are therefore serialized, and the checks (daily total, week status) read committed state. Decisions additionally use a status-guarded `UPDATE ... WHERE status = 'SUBMITTED'`, so of two concurrent decisions exactly one wins.

Alternatives: `SERIALIZABLE` isolation with retries (more complex error handling), row lock on the `users` row (works, but advisory locks avoid blocking unrelated updates to that row), a DB trigger for the 24 h rule (possible later; the service check under the lock is sufficient for the POC).

Consequences: the lock is per user, so it does not protect against *period locking* by an admin; that is Phase 5 and needs its own enforcement (and likely a DB-level guard). Audit-trail writes for submit/approve/reject are also Phase 5 (they will be added inside these same transactions).
