# 0012. Admin-only user creation

Status: Accepted (added after Phase 10 at the owner's request; Phases 0–10 had no user administration).

## Context
Users existed only through the dev seed script (ADR 0003 deliberately has no registration). The owner wants an admin to create contributor and manager accounts from the UI.

## Decision
- `POST /api/users`, **admin only**, plus an admin-only **Users** page (`/users`) listing users and a create form.
- Creatable roles are `CONTRIBUTOR` and `MANAGER`. Admin accounts are not creatable through the API, so a stolen or misused admin session cannot mint more admins; they still come from the seed or the database.
- A contributor must name an **active MANAGER** (422 otherwise): submitting a week needs one (ADR 0004). A manager has no manager.
- The admin chooses the **initial password** (min 12 characters, like the seed). It is hashed with argon2id and never returned or logged.
- Duplicate emails are caught by the unique index (409), not a pre-check, so concurrent creates cannot both succeed.

## Alternatives
- Public signup: anyone could register and pick a role. Rejected.
- Invite or reset-link email flow: the right production design (the admin never knows the password) but needs an email service and token tables; out of scope for the POC.
- Letting managers create their own contributors: plausible, but widens who can create accounts; not requested.

## Consequences / follow-ups
- No password change, reset, deactivate or edit-user feature exists yet: a mistake in a name, role or manager needs a database edit. Users cannot change the password the admin chose; treat it as temporary and share it securely.
- User creation is not written to the audit log (the audit trail is period-lock focused). Worth adding if accountability for account creation matters.
