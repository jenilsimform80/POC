# 0003. Server-side cookie sessions with argon2id

Status: Accepted (Phase 3). **The cookie transport is superseded by [ADR 0015](0015-bearer-token-authentication.md)** (bearer tokens); the hashed server-side session row, argon2id and uniform login errors still apply.

Context: The SPA and API are separate packages (different origins in development). We need login, real logout, and role/ownership checks enforced on the backend.

Decision:
- **Sessions, not JWT.** On login the server creates a random 256-bit token, stores only its SHA-256 hash in the `sessions` table with an absolute expiry (default 8 h, `SESSION_TTL_HOURS`), and sends the token in an `HttpOnly`, `SameSite=Lax`, `Secure` (production) cookie named `sid`. A custom ~40-line implementation (Prisma + `crypto`) was chosen over `express-session` plus a store to avoid extra dependencies and keep sessions in our migrated schema.
- **Passwords:** `argon2` (argon2id, library defaults). Unknown-email logins still run a dummy verification so timing does not reveal which emails exist. Every login failure returns the same 401 message.
- **Fixation / reuse:** every login issues a new token and deletes the session the client presented; logout deletes the row, so a stolen token dies immediately.
- **CSRF:** `SameSite=Lax` plus an `Origin` allow-list check on all state-changing requests (CORS allow-list is the same list).
- **Brute force:** `express-rate-limit` on `/auth/login`, per IP, counting failed attempts only (default 10 per 15 min).
- **Authorization:** `authenticate` (session → `req.auth`), `authorize(...roles)` for role gates, and ownership/reporting-line rules in `src/authorization/policies.ts` expressed as Prisma `where` filters, so the database applies scope in the same query that fetches the record. Out-of-scope records return **404**, identical to "does not exist"; role failures return **403**.

Alternatives: JWT in memory/cookie (cannot revoke on logout without a server-side list, which is a session store anyway); `express-session` + `connect-pg-simple` (works, but a second schema and more dependencies); bcrypt (acceptable, but argon2id is memory-hard and preferred); `Strict` cookies (breaks following links into the app; Lax plus the Origin check is sufficient here).

Consequences: Each authenticated request costs one indexed DB lookup (acceptable at this project's scale). Expired sessions are deleted when encountered; there is no background cleanup job yet (known limitation). Session TTL is absolute, not sliding. Changing a user's role or deactivating them takes effect on their next request because the user row is read on every request.
