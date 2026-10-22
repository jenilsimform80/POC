# 0017. Forgotten passwords: admin-assisted reset

Status: Accepted (extends 0012; added at the owner's request).

## Context
Users can forget their password. ADR 0012 let an admin reset a contributor's or manager's password, but the admin chose it, the user was never forced to replace it, nothing was audited, and a forgotten **admin** password could only be fixed by editing the database. There is no email service in the project.

## Decision
1. **Forced change after a reset.** `users.must_change_password` is set by the admin reset and cleared by `change-password`. `createAuthenticate` refuses every route with 403 `PASSWORD_CHANGE_REQUIRED` unless the route opts in (`/auth/me`, `/auth/change-password`). Deny by default: a new route is protected without anyone remembering a check. The UI redirects to Account, but the backend is the boundary.
2. **Generated temporary password.** The reset form can generate 16 random characters in the browser (`crypto.getRandomValues`, no look-alike characters). It is shown once after saving and never retrievable again.
3. **Audit.** The reset writes `PASSWORD_RESET` (actor, target, never the password) in the same transaction as the update.
4. **Admin recovery CLI.** `npm run admin:reset-password -- <email>` (hidden prompt, or `RESET_PASSWORD` for automation) hashes the password, ends the account's sessions and audits it with `metadata.via = cli`. It is not an HTTP route: access to the server and its database is the authority. The audit actor is the account itself because the table needs an existing user.
5. **Login page hint** tells users to ask an admin.

## Alternatives
- **Emailed reset links** (the usual design): needs an SMTP service, a token table, expiry, rate limits and care not to reveal which emails exist. Deferred: larger, and needs email set up in every environment. This decision does not block adding it later.
- **Let managers reset their reports' passwords:** widens who can set another person's credentials; not requested.
- **Allow admins to reset other admins over HTTP:** rejected in 0012 (a stolen admin session could take over the other admin accounts).

## Consequences
- An admin still sees the temporary password they hand over; the forced change limits how long it matters.
- The CLI can reset any user's password, so it must only be run by someone trusted with the server.
