> **Derived from prompt — original specification unverified.**
> This document was written from the master project prompt only. The original specification has not been provided or reviewed, so no requirement below is verified against it. Backlog task POC-DOC-001 tracks verification once the spec is supplied.

# Requirements

## Objective
A timesheet and project billing application where contributors log daily hours against projects/tasks, submit weekly timesheets, managers approve or reject, finance/admin lock billing periods, and reports show hours and budget usage. The central challenge is **period locking and data integrity**.

## Roles
| Role | Capabilities (as understood) |
|------|------------------------------|
| Contributor | Log, edit, delete own time entries; submit own weeks |
| Manager | Approve/reject weekly submissions of **direct reports only** |
| Admin / Finance | Lock billing periods; (unlock policy open) |

## Functional requirements
- **FR-1 Time entries**: daily hours per project and task, classified billable/non-billable.
- **FR-2 Weekly submission**: contributor submits a week; behavior of edits after submission must be defined.
- **FR-3 Approval**: manager approves or rejects a direct report's submission.
- **FR-4 Period locking**: authorized users lock a billing period. Locked periods are immutable for create, update and delete through **every** application and API write path, including direct API calls.
- **FR-5 Reports**: hours by contributor, project and month.
- **FR-6 Budget report**: logged hours vs allocated hours per project.
- **FR-7 Audit trail**: submissions, approvals, rejections and lock actions recorded in a structured log.
- **FR-8 Validation**: daily and weekly hour validation and warnings.
- **FR-9 Projects and tasks**: management and viewing of projects and their tasks.

## Non-functional requirements
- NFR-1 Backend enforces all authorization and lock rules; the UI is not a security boundary.
- NFR-2 Concurrent edit/lock operations must not violate immutability.
- NFR-3 Reports use PostgreSQL aggregation, not in-memory loading.
- NFR-4 Docker Compose startup (`docker compose up`) as a final delivery requirement.
- NFR-5 Automated tests for business rules, security and failure cases.

## Open questions (need owner input or the original spec)
1. Original specification document (verify all of the above).
2. Is unlock supported? If so, with required reason and audit record?
3. Daily and weekly hour limits; hard error vs warning.
4. Week definition (start day) and billing period granularity (month? arbitrary range?).
5. What happens to an approved/submitted week when a contributor edits an entry? Rejected weeks: editable again?
6. Is a lock global or per project? Are admins exempt from lock?
7. Does a manager hierarchy have depth, or only direct reports? Can a user be their own manager's report?
8. Time zone policy for entry and project dates (decision planned for Phase 6).

## Phase 4 working assumptions (unverified — adopted so work could proceed; confirm against the spec)
- Hours per entry in 0.25 steps, ≤ 24; daily total ≤ 24 (hard); warnings above 10 h/day and 48 h/week (soft).
- Submitted/approved weeks are frozen; rejected weeks are editable and resubmittable; no recall action.
- A week must contain at least one entry to be submitted; a user without a manager cannot submit.
- Only the owner's direct manager approves/rejects; if the owner has no usable manager (none assigned, deactivated, or not a MANAGER) any other admin does instead (never the owner themself); rejection needs a reason.
- Admin manages projects/tasks; all users may log time against any active project (no per-project assignment model).
- Entries are not restricted to past dates; entry dates must lie within the project's date window when one is set.

## Phase 5 working assumptions (unverified — confirm against the spec)
- A lock covers one global calendar month and protects time entries; unlock is allowed (admin only, reason required, audited); admins are not exempt from locks.
- Rejecting a week that touches a locked month is refused; approving it is allowed.
- Audit trail covers submit, approve, reject, lock, unlock; readable by admins only; append-only.

## Phase 6 working assumptions (unverified — confirm against the spec)
- Reports: hours by contributor / project / month (any combination); contributors see their own, managers themselves and direct reports, admins everyone; all logged hours count (not only approved).
- Budget report is admin-only, lifetime (optional `through` date); WARNING from 80 % of budget, OVER above 100 %.
- Dates are calendar dates, never time-zone converted; supported years 2000–2100 (ADR 0006).
