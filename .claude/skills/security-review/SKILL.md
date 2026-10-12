---
name: security-review
description: Security checklist for this POC — authentication, role and ownership authorization, IDOR prevention, input validation and period-lock enforcement. Use when reviewing or writing anything that touches auth, permissions or write paths.
---

# Security review

Review the changed code against each item; report findings with file and line.

## Authentication
- Passwords hashed with argon2id or bcrypt; never logged or returned.
- Session/token cookies: `HttpOnly`, `Secure` (non-dev), `SameSite`; expiry and logout invalidation work. CSRF protection if cookie auth.
- Login rate limiting; identical error for unknown user vs bad password.

## Authorization
- Every non-public route has `authenticate`; role check via middleware; **ownership/relationship check in the service**.
- Contributor sees only own entries/submissions. Manager acts only on direct reports. Admin/Finance for lock actions.
- IDOR: never fetch by id alone — scope by owner or verify relationship; consistent 403/404.

## Input
- Zod on body, params and query; reject unknown fields where sensible; bounds on hours, dates, string lengths.
- Raw SQL parameterized; no user input in file paths or shell.

## Period lock (highest priority)
- Enumerate **all** write paths touching entries (create, update, delete, submit/approve side effects, bulk/import) and confirm each checks the lock.
- Check is inside the same transaction as the write; a lock racing an edit cannot slip through.
- Edits that move an entry **into or out of** a locked period (date change) are also rejected.
- State clearly which layer enforces it (service vs DB trigger); claim DB-level only if tested at DB level.

## Errors and config
- No stack traces or SQL in responses; helmet and CORS allow-list set; no secrets in repo or logs.
- Audit log written for submit, approve, reject, lock (and unlock if included) in the same transaction as the action.
