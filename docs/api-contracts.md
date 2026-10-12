# API Contracts

Status: Phase 6 — contracts for every implemented endpoint (health, auth, users, projects, time entries, timesheets, submissions, locked periods, audit, reports). Contracts are written before implementation and kept in step with the tests.

## Conventions
- Base path `/api`; JSON bodies; plural nouns (`/api/time-entries`).
- Auth required unless stated; role and ownership rules listed per endpoint.
- Success: `200/201` with resource JSON; `204` for deletes.
- Errors:
```json
{ "error": { "code": "PERIOD_LOCKED", "message": "Human-readable text", "details": {} } }
```
- Statuses: 400 validation, 401 unauthenticated, 403 forbidden, 404 not found, 409 conflict/period locked, 422 business rule, 500 internal.

## Endpoint template
`METHOD /path` — Auth/roles · Request (params, query, body schema) · Responses · Errors · Notes (ownership, lock behavior).

## Endpoints
### GET /api/health
- Auth: none (public). Request: no params, query or body.
- 200 response:
```json
{ "status": "ok", "uptimeSeconds": 12, "timestamp": "2026-10-11T13:57:38.832Z" }
```
- Unknown routes return 404 `NOT_FOUND`; malformed JSON bodies return 400 `VALIDATION_ERROR`; validation failures include `details: [{ location, path, message }]`.
- Implemented and tested in Phase 1 (`backend/tests/health.test.ts`).

### GET /api/health/db
- Auth: none (public; reveals only up/down). Runs `SELECT 1` through Prisma.
- 200: `{ "status": "ok", "database": "up" }`
- 503: `{ "status": "unavailable", "database": "down" }` (no error details leaked)
- Added in Phase 2 (`backend/tests/health.test.ts`).

## Authentication (Phase 3)
Cookie `sid` (HttpOnly, SameSite=Lax, Secure in production) identifies the session. Browsers must send credentials (`fetch(..., { credentials: 'include' })`). State-changing requests from a browser `Origin` that is not in `CORS_ORIGIN` get 403.

### POST /api/auth/login
- Auth: none. Body: `{ "email": string, "password": string }` (email trimmed and lower-cased; password 1–128 chars).
- 200: `{ "user": { id, email, name, role, managerId } }` and `Set-Cookie: sid=…`
- 400 `VALIDATION_ERROR`; 401 `UNAUTHENTICATED` ("Invalid email or password" for unknown email, wrong password and inactive account alike); 429 `RATE_LIMITED` after too many failed attempts from one IP; 403 for a foreign `Origin`.

### POST /api/auth/logout
- Auth: none required (idempotent). Deletes the server-side session and clears the cookie. 204.

### GET /api/auth/me
- Auth: session. 200 `{ "user": {…} }`; 401 `UNAUTHENTICATED`.

## Users (Phase 3 — scoping rules demonstrated; user administration comes later)
All routes require a session (401 otherwise). Scope by role:
| Role | Sees |
|------|------|
| CONTRIBUTOR | only themself |
| MANAGER | themself and direct reports (`managerId` = them) |
| ADMIN | everyone |

### GET /api/users
200 `{ "users": [{ id, email, name, role, managerId, isActive }] }` limited to the caller's scope.

### GET /api/users/direct-reports
MANAGER only (403 `FORBIDDEN` otherwise, including ADMIN). 200 `{ "users": […] }`.

### GET /api/users/:id
`:id` must be a UUID (400 otherwise). 200 `{ "user": {…} }`; **404 `NOT_FOUND`** when the user does not exist *or* is outside the caller's scope (identical responses, so ids cannot be probed).

## Authorization rule for approvals (implemented as a service function; endpoints arrive in Phase 4)
`assertCanDecideSubmission(prisma, actor, submissionId)`: only role MANAGER, and only the submission owner's **current** direct manager. ADMIN, the owner, colleagues and other managers are refused (403 for wrong role, 404 for out-of-scope or missing).

# Phase 4 — Projects, time entries, timesheets, submissions
All routes require a session (401 otherwise) and send/receive JSON. Dates are `YYYY-MM-DD` strings (calendar dates, never converted between time zones: ADR 0006) with years **2000–2100** (otherwise 400); hours are numbers. Unknown body fields are rejected (400) on every write endpoint, including login. Framework-level client errors (413/415/malformed URL or JSON) are 4xx in the standard error shape; internal errors are a generic 500. Rule values are assumptions (ADR 0004).

## Error codes used
| Status | `error.code` | When |
|--------|--------------|------|
| 400 | `VALIDATION_ERROR` | bad input (`details: [{location, path, message}]`) |
| 403 | `FORBIDDEN` | wrong role, or visible-but-not-yours entry mutation |
| 404 | `NOT_FOUND` | missing **or** out of the caller's scope |
| 409 | `CONFLICT` | duplicate project code / task name |
| 409 | `WEEK_NOT_EDITABLE` | entry write in a SUBMITTED/APPROVED week (`details: {weekStart, status}`) |
| 429 | `RATE_LIMITED` | too many failed logins from one IP (`POST /api/auth/login`) |
| 413 | `PAYLOAD_TOO_LARGE` | JSON body over 100 kB |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | unsupported `Content-Encoding`/content type |
| 400 | `BAD_REQUEST` | other malformed-request errors raised by Express |
| 503 | `SERVICE_UNAVAILABLE` | transient database condition (transaction timeout, deadlock, lock timeout); safe to retry |
| 409 | `PERIOD_LOCKED` | write to an entry in a locked month, or rejecting a week touching one (`details: {period, enforcedBy: "service"|"database"}`) |
| 409 | `INVALID_STATE` | resubmitting a submitted week; deciding a non-SUBMITTED submission |
| 422 | `DAILY_LIMIT_EXCEEDED` | day total would exceed 24 h |
| 422 | `BUSINESS_RULE_VIOLATION` | archived project/task, task not in project, date outside project window, empty week, no manager, end before start |

## Projects and tasks
| Endpoint | Who | Notes |
|----------|-----|-------|
| `GET /api/projects` | any | active projects with active tasks; `?includeArchived=true` is admin-only (403 otherwise) |
| `GET /api/projects/:id` | any | archived projects are 404 for non-admins |
| `POST /api/projects` | ADMIN | body `{code, name, clientName?, budgetHours, startDate?, endDate?}` → 201 `{project}`; duplicate code 409 |
| `PATCH /api/projects/:id` | ADMIN | any of the fields plus `isActive` (archive); `clientName/startDate/endDate` may be `null`; ≥1 field |
| `POST /api/projects/:id/tasks` | ADMIN | `{name}` → 201 `{task}`; duplicate name in project 409 |
| `PATCH /api/projects/:id/tasks/:taskId` | ADMIN | `{name?, isActive?}`; task must belong to `:id` else 404 |

Project view: `{id, code, name, clientName, budgetHours, startDate, endDate, isActive, tasks:[{id,name,isActive}]}`.

## Time entries
Entry view: `{id, userId, projectId, taskId, workDate, hours, isBillable, notes, createdAt, updatedAt}`. Write responses: `{entry, warnings:[{code, message, total, threshold, date?}]}` with codes `DAILY_HOURS_HIGH`, `WEEKLY_HOURS_HIGH`.

| Endpoint | Rules |
|----------|-------|
| `POST /api/time-entries` | body `{projectId, taskId, workDate, hours (0<h≤24, step 0.25), isBillable, notes?≤1000}`; owner is always the caller → 201 |
| `GET /api/time-entries?from&to[&projectId][&userId]` | `from`,`to` required, from ≤ to, ≤ 366 days, max 1000 rows. Default = own entries; `userId` must be in the caller's scope (self, direct report for managers, anyone for admin) else 404 |
| `GET /api/time-entries/:id` | owner, owner's manager or admin; others 404 |
| `PATCH /api/time-entries/:id` | owner only (403 if visible, 404 if not); fields optional (≥1); `taskId` required when `projectId` changes; frozen weeks 409 (both the old and the new date's week are checked). Project/task/date-window rules are re-checked **only when the project, task or date changes**, so hours/notes/billable can still be corrected after a project was archived |
| `DELETE /api/time-entries/:id` | owner only; 204; frozen week 409 |
| `GET /api/timesheets/:weekStart[?userId]` | `:weekStart` must be a Monday. Returns `{userId, weekStart, weekEnd, status (DRAFT/SUBMITTED/APPROVED/REJECTED), submission, entries, dailyTotals, weeklyTotal, billableTotal, nonBillableTotal, warnings}` |

## Submissions
Submission view: `{id, userId, weekStart, status, submittedAt, updatedAt, approvals?:[{id, managerId, decision, comment, decidedAt}]}`.

| Endpoint | Rules |
|----------|-------|
| `POST /api/submissions` | `{weekStart (Monday)}`; own week only; needs ≥1 entry and an assigned manager who is an **active user with role MANAGER** (otherwise 422: the week would never be decidable); resubmits a REJECTED week; SUBMITTED/APPROVED → 409 `INVALID_STATE` → 201 `{submission}` |
| `GET /api/submissions?status&weekStart&userId&forApproval` | scoped: contributor own; manager own + reports; admin all. `forApproval=true` (MANAGER only, else 403) lists only direct reports' submissions and **defaults to `status=SUBMITTED`** (the pending queue); pass `status` explicitly to see decided ones. A `userId` outside the caller's scope is 404, like on the entry and timesheet endpoints |
| `GET /api/submissions/:id` | owner, owner's manager, admin; others 404; includes `approvals` history |
| `POST /api/submissions/:id/approve` | role MANAGER (else 403) **and** owner's current direct manager (else 404); optional `{comment}`; must be SUBMITTED else 409 |
| `POST /api/submissions/:id/reject` | same as approve; `{comment}` required (non-blank) |

# Phase 5 — Period locking and audit trail
Policy and rationale: ADR 0005 (assumptions, spec unverified).

## Locked periods
| Endpoint | Who | Notes |
|----------|-----|-------|
| `GET /api/locked-periods` | any signed-in user | `{lockedPeriods: [{period: "YYYY-MM", lockedAt, note, lockedBy: {id, name}}]}`, newest first |
| `POST /api/locked-periods` | ADMIN | body `{period: "YYYY-MM", note?}` → 201 `{lockedPeriod}`; already locked 409 `CONFLICT`. Audit `PERIOD_LOCKED` records `{period, entryCount, totalHours, note?}` (the frozen snapshot) |
| `POST /api/locked-periods/:period/unlock` | ADMIN | body `{reason}` (3–500 chars, required) → 204; not locked → 404. Audit `PERIOD_UNLOCKED` records the reason |

Effect on other endpoints: `POST/PATCH/DELETE /api/time-entries…` return **409 `PERIOD_LOCKED`** for any entry whose current or new `workDate` is in a locked month (checked after ownership, so other users' entries still give 404/403 and leak nothing). `POST /api/submissions/:id/reject` returns 409 `PERIOD_LOCKED` if any day of the week is in a locked month; approve is unaffected.

## Audit trail
`GET /api/audit-logs` — ADMIN only (403 otherwise). Query: `action` (`SUBMISSION_SUBMITTED|SUBMISSION_APPROVED|SUBMISSION_REJECTED|PERIOD_LOCKED|PERIOD_UNLOCKED`), `entityType` (`weekly_submission|locked_period`), `entityId` (uuid), `actorId` (uuid), `limit` (1–200, default 50), `offset` (default 0). Newest first.
Response: `{auditLogs: [{id, action, entityType, entityId, metadata, createdAt, actor: {id, name, email}}]}`.
Metadata: submit `{userId, weekStart, resubmission}`; approve/reject `{userId, weekStart, comment?}`; lock `{period, entryCount, totalHours, note?}`; unlock `{period, reason, lockedAt, lockedById}`.
Each record is written in the same transaction as its action; refused actions write nothing. The table is append-only in the database.

# Phase 6 — Reports
Both reports aggregate in PostgreSQL (ADR 0007). Dates in the request are inclusive calendar dates (ADR 0006). Hours include all logged entries regardless of submission status (assumption).

## GET /api/reports/hours
Auth: any signed-in user, **scoped by role**: contributor = own hours; manager = self + direct reports; admin = everyone.

Query:
| Param | Required | Notes |
|-------|----------|-------|
| `from`, `to` | yes | `YYYY-MM-DD`, inclusive, `from ≤ to`, at most 1830 days |
| `groupBy` | yes | comma list, any non-empty duplicate-free subset of `contributor`, `project`, `month` (e.g. `month`, `contributor,project`, `contributor,project,month`) |
| `userId` | no | must be in the caller's scope, else 404 |
| `projectId` | no | uuid |

200 response:
```json
{
  "from": "2026-02-01", "to": "2026-04-30", "groupBy": ["month"],
  "rows": [
    { "month": "2026-03", "totalHours": 31.75, "billableHours": 20.5, "nonBillableHours": 11.25, "entryCount": 7 }
  ],
  "totals": { "totalHours": 38.75, "billableHours": 27.5, "nonBillableHours": 11.25, "entryCount": 9 },
  "truncated": false
}
```
Each row contains only the requested dimensions: `userId`+`userName` (contributor), `projectId`+`projectCode`+`projectName` (project), `month` as `YYYY-MM` (month), plus the four measures. Rows are ordered by month, contributor name, project code. At most 5000 rows are returned; `truncated: true` means more existed (narrow the range or filters). Errors: 400 invalid query (including unknown/duplicate `groupBy`, impossible dates, range too long), 401, 404 out-of-scope `userId`.

## GET /api/reports/project-budgets
Auth: **ADMIN only** (403 otherwise): it compares all users' hours with a project-wide budget.

Query: `projectId` (uuid), `through` (`YYYY-MM-DD`: count hours up to and including that date), `includeArchived` (`true`/`false`, default false).

200 response:
```json
{
  "through": null,
  "projects": [
    { "projectId": "…", "code": "P1", "name": "Project P1", "isActive": true,
      "budgetHours": 40, "loggedHours": 25, "billableHours": 23, "nonBillableHours": 2,
      "remainingHours": 15, "percentUsed": 62.5, "status": "OK" }
  ],
  "totals": { "budgetHours": 50, "loggedHours": 31.5 }
}
```
`status`: `OK`; `WARNING` when logged ≥ 80 % of budget; `OVER` when logged > budget (exactly 100 % is `WARNING`, not over). `percentUsed` is `null` for a zero budget (a zero budget with any hours is `OVER`). Projects without hours are included. `remainingHours` may be negative.

# Phase 9 changes to existing contracts
- **All responses** carry `Cache-Control: no-store` and `Vary: Cookie`; there is no `ETag`.
- **NUL characters** (`\u0000`, or `%00` in a URL) anywhere in a request are rejected with 400 `VALIDATION_ERROR` (PostgreSQL cannot store them).
- **`GET /api/projects` and `GET /api/projects/:id`:** `budgetHours` is **omitted for non-admins** (admins, and the responses of project create/update, include it).
- **`POST /api/auth/login`:** besides the failed-attempts limit (429 `RATE_LIMITED`, "Too many failed login attempts…"), all attempts per IP are capped (429 `RATE_LIMITED`, "Too many login attempts…"). In production the session cookie is named `__Host-sid` (Secure, `Path=/`, no `Domain`); in development `sid`.
