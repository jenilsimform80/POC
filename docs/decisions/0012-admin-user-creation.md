# 0012. Admin-only user administration

Status: Accepted (added after Phase 10 at the owner's request; Phases 0–10 had no user administration).

## Context
Users existed only through the dev seed script (ADR 0003 deliberately has no registration). The owner wants an admin to create contributor and manager accounts from the UI.

## Decision
- `POST /api/users`, **admin only**, plus an admin-only **Users** page (`/users`) listing users and a create form.
- Creatable roles are `CONTRIBUTOR` and `MANAGER`. Admin accounts are not creatable through the API, so a stolen or misused admin session cannot mint more admins; they still come from the seed or the database.
- A contributor must name an **active MANAGER** (422 otherwise): submitting a week needs one (ADR 0004). A manager has no manager.
- The admin chooses the **initial password** (min 8 characters, like the seed). It is hashed with argon2id and never returned or logged.
- Duplicate emails are caught by the unique index (409), not a pre-check, so concurrent creates cannot both succeed.

## Alternatives
- Public signup: anyone could register and pick a role. Rejected.
- Invite or reset-link email flow: the right production design (the admin never knows the password) but needs an email service and token tables; out of scope for timesheets-billing.
- Letting managers create their own contributors: plausible, but widens who can create accounts; not requested.

## Editing, deactivating and passwords (added in a second step)
- `PATCH /api/users/:id` (name, role, manager, active) and `POST /api/users/:id/password` are admin only; `POST /api/auth/change-password` is for any signed-in user.
- **Admin accounts are not editable or resettable through the API.** This removes the "last admin locks everyone out" and "admin demotes themself" failure modes without extra counting logic. Admins change their own password via change-password.
- **State must stay consistent.** A contributor always has an active manager; a manager always has none. A manager with active reports cannot be deactivated or demoted, because their reports could no longer submit (ADR 0004 requires an active manager at submit). The admin must reassign them first. This trades convenience for never creating a stranded user.
- **Deactivate, not delete.** Users own entries, submissions and audit rows (deletes are RESTRICT), so deactivation keeps history intact. It ends the user's sessions immediately and blocks login.
- **One advisory lock for all user-administration writes** (rare operations, so no contention concern). Without it, "deactivate manager" and "assign a report to them" could both pass their checks and commit, stranding the report. A test runs both concurrently.
- **Password changes end sessions**: all of a user's sessions on admin reset; all *other* sessions on self-change. Self-change requires the current password, and wrong attempts share the login failure rate limit.
- A wrong current password returns 401, so the frontend calls it with `handleUnauthorized: false`; otherwise the central 401 handler would sign the user out for a typo.
- Email addresses cannot be edited (they are the login identity; a change would need verification).

## Consequences / follow-ups
- Still no email change, no invite/reset-link flow, and no admin creation or editing through the API. The admin knows the initial/reset password; users should change it on first login (not enforced).
- User creation is not written to the audit log (the audit trail is period-lock focused). Worth adding if accountability for account creation matters.
