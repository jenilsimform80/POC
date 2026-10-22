# Backlog

Status values: Todo, In Progress, Blocked, Done. Priority: P0 (critical) – P2. Requirements are "Derived from prompt — original specification unverified."

## Phase 0 — Workspace and Engineering Foundation

### POC-DOC-000 Foundation setup
- **Description**: Inspect workspace, create CLAUDE.md, skills, commands, docs skeletons, backlog, phase status; init Git.
- **Phase**: 0 · **Priority**: P0 · **Dependencies**: none · **Status**: Done (pending phase approval)
- **Acceptance**: structure agreed; instructions and tracking exist; requirements and phase plan documented; nothing overwritten; next phase defined.
- **Tests**: file/structure validation, frontmatter check, git status review.
- **Files**: CLAUDE.md, README.md, .gitignore, `.claude/`, `docs/`, `.claude/tasks/`.

### POC-DOC-001 Verify requirements against original spec
- **Description**: When the original spec is supplied, review it and reconcile `docs/requirements.md`; remove the "unverified" banner only after review.
- **Phase**: any (blocks claiming full coverage) · **Priority**: P0 · **Dependencies**: spec provided by owner · **Status**: Blocked (spec not provided)
- **Acceptance**: each requirement mapped to a spec section; gaps/conflicts listed.
- **Tests**: n/a · **Docs**: docs/requirements.md

## Phase 1 — Backend Foundation
Status: tasks complete, pending phase approval. Phase acceptance (starts, health works, typecheck/lint pass, test passes, no secrets committed, README documents setup) verified — see `phase-status.md`.
- **POC-BE-001** Init backend package, TS strict, ESLint/Prettier. P0. Status: Done. Tests: `npm run typecheck`, `lint`, `format:check` pass.
- **POC-BE-002** Express app, layered folders, Zod env validation, `.env.example`. P0. Deps BE-001. Status: Done. Tests: `tests/env.test.ts`; manual start and invalid-env fail-fast check.
- **POC-BE-003** Central error handling, validation middleware, helmet/CORS. P0. Deps BE-002. Status: Done. Tests: `tests/error-handling.test.ts`.
- **POC-BE-004** Health endpoint + test setup (Vitest + Supertest). P0. Deps BE-003. Status: Done. Tests: `tests/health.test.ts`.
- **POC-BE-005** Backend README (setup/commands). P1. Deps BE-004. Status: Done.

## Phase 2 — PostgreSQL and Prisma
Status: tasks complete, pending phase approval. Owner decisions: restrict + soft-archive deletes; `users.manager_id`; global calendar-month locks; owner created role/databases (`timesheets`, `timesheets_dev`, `timesheets_test`).
- **POC-DB-001** Verify local Postgres connectivity. P0. Status: Done. Evidence: `psql` as role `timesheets` (non-superuser) to both DBs; `GET /api/health/db` returned 200 against the dev DB.
- **POC-DB-002** Configure Prisma 7.10.0 (stable). P0. Status: Done. See ADR 0002.
- **POC-DB-003** Initial schema: users, projects, tasks, time_entries, weekly_submissions, approvals, locked_periods, audit_logs; enums, constraints, indexes. P0. Status: Done.
- **POC-DB-004** Generate/apply migration; DB integration test. P0. Status: Done. Tests: `tests/db/schema.integration.test.ts`; `npm run check` passes (25 tests).
- **POC-DB-005** Document design and pgAdmin 4 inspection. P1. Status: Done (`docs/database-design.md`). The pgAdmin steps were partly exercised with the owner; the final `timesheets` role registration was not observed by me.
- Phase acceptance: Prisma configured, connectivity works, migrations apply, design documented, DB integration test passes — all verified.

## Phase 3 — Authentication and Authorization
Status: tasks complete, pending phase approval. Decisions: cookie sessions + argon2id (ADR 0003); admins do not approve timesheets; out-of-scope records return 404.
- **POC-AUTH-001** Session strategy ADR. P0. Status: Done (`docs/decisions/0003-session-strategy.md`).
- **POC-AUTH-002** Login/logout with password hashing. P0. Status: Done. Tests: `tests/auth.test.ts` (19).
- **POC-AUTH-003** Roles and authentication/authorization middleware. P0. Status: Done. Tests: `tests/authorization.test.ts`.
- **POC-AUTH-004** Ownership and manager-report rules. P0. Status: Done at policy/service level (`src/authorization/*`). Approve/reject HTTP endpoints are Phase 4 (POC-API-005), which must add HTTP-level tests for `assertCanDecideSubmission`.
- **POC-AUTH-005** Authorization negative tests. P0. Status: Done (`authorization.test.ts`, `submission-approval-policy.test.ts`; mutation-checked).
- Phase acceptance: authentication works; protected routes reject anonymous; contributors cannot access others' data; managers limited to direct reports; authorization tests pass — verified (see phase-status.md).

## Phase 4 — Timesheet and Project APIs
Status: tasks complete, pending phase approval. Rules/assumptions: ADR 0004 and `docs/requirements.md` (unverified).
- **POC-API-001** Projects and tasks (admin write, all read, archive instead of delete). P0. Status: Done. Tests: `tests/projects.test.ts`.
- **POC-API-002** Time entry create/list/get/update/delete with billable flag; owner-only mutation. P0. Status: Done. Tests: `tests/time-entries.test.ts`.
- **POC-API-003** Daily/weekly validation and warnings; week summary endpoint. P0. Status: Done. Tests: `time-entries.test.ts`, `timesheet-rules.test.ts`, `dates.test.ts`.
- **POC-API-004** Weekly submission workflow. P0. Status: Done. Tests: `tests/submissions.test.ts`.
- **POC-API-005** Manager approve/reject with HTTP-level authorization tests. P0. Status: Done. Tests: `submissions.test.ts` ("authorization on approve/reject").
- **POC-API-006** Edit-after-submission behavior (freeze; rejected weeks reopen). P0. Status: Done. Tests: `submissions.test.ts`.
- Phase acceptance: contract, validation, ownership and positive/negative tests per endpoint; API docs updated — verified (see phase-status.md). Audit writes deferred to Phase 5 (POC-LOCK-005).

## Phase 5 — Period Locking and Audit Trail
Status: tasks complete, pending phase approval. Policy/assumptions: ADR 0005 and `docs/requirements.md` (unverified).
- **POC-LOCK-001** Lock model and unlock policy (global month; admin-only unlock with reason). P0. Status: Done (ADR 0005).
- **POC-LOCK-002** Service-level enforcement on create/update/delete/move. P0. Status: Done. Tests: `period-lock.test.ts`.
- **POC-LOCK-003** Database trigger (`LK001`) + append-only audit trigger (`LK002`). P0. Status: Done and tested at DB level with raw SQL. Limit: the table-owner role can disable it (documented, verified).
- **POC-LOCK-004** Transactions and concurrency control (shared/exclusive advisory lock per month). P0. Status: Done. Tests: deterministic + randomized races.
- **POC-LOCK-005** Audit trail for submit/approve/reject/lock/unlock + `GET /api/audit-logs`. P0. Status: Done. Tests: `audit.test.ts`.
- **POC-LOCK-006** Required tests (locked create/update/delete, other user's entry, concurrent lock/edit, enforcement layer shown). P0. Status: Done; mutation-checked.
- Phase acceptance verified (see phase-status.md).

## Phase 6 — Reports and Backend Completion
Status: tasks complete, pending phase approval. Assumptions: ADR 0006/0007 and `docs/requirements.md` (unverified).
- **POC-RPT-001** Hours by contributor/project/month via SQL aggregation (`GET /api/reports/hours`). P0. Status: Done. Tests: `reports.test.ts`.
- **POC-RPT-002** Project budget report (`GET /api/reports/project-budgets`, admin-only). P0. Status: Done. Tests: `reports.test.ts`.
- **POC-RPT-003** Time zone policy (ADR 0006) with session- and process-time-zone tests. P0. Status: Done.
- **POC-RPT-004** Indexes from measured query patterns (ADR 0007: no new index; manager-scope query rewrite). P1. Status: Done (EXPLAIN on 600 k rows).
- **POC-RPT-005** Complete API docs and backend review (independent review: 8 findings, all reproduced then fixed). P0. Status: Done. Tests: `review-regressions.test.ts`.
- Phase acceptance verified (see phase-status.md). Open: admin project changes are not audited (not required by any doc).

## Phase 7 — Frontend Foundation
Status: tasks complete, pending phase approval. Decisions: ADR 0008.
- **POC-FE-001** Vite + React + TypeScript (strict), routing, ESLint, Prettier, Vitest + RTL. P0. Status: Done. Tests: `npm run check` (typecheck, lint, format, 48 tests); `npm run build` passes.
- **POC-FE-002** Centralized API client and environment-based API URL (`VITE_API_BASE_URL`, dev proxy). P0. Status: Done. Tests: `api-client.test.ts`, `env.test.ts`, `health-api.test.ts`.
- **POC-FE-003** Loading/error/empty/success states and backend health integration (System status page). P0. Status: Done. Tests: `ui-components.test.tsx`, `useAsync.test.tsx`, `status-page.test.tsx`, `routing.test.tsx`. Real-chain connectivity verified by running both servers.
- **POC-FE-004** Frontend README. P1. Status: Done.
- Phase acceptance verified (see phase-status.md). Not in scope: login, feature screens (Phase 8).

## Phase 8 — Frontend Features
Status: tasks complete, pending phase approval. Decisions: ADR 0009. Each screen runs against the real API (no mock data in the implementation); tests stub `fetch`, and a live contract check plus a real-browser run verified the integration.
- **POC-FE-010** Login, session bootstrap, central 401 handling, route guards, role-aware navigation. P0. Status: Done. Tests: `auth.test.tsx`, `api-client.test.ts`.
- **POC-FE-011** Contributor timesheet: week view, add/edit/delete entries, totals, warnings, frozen/locked mirroring, submission history. P0. Status: Done. Tests: `timesheet.test.tsx`.
- **POC-FE-012** Weekly submission (confirm, status, rejection reason, resubmit). P0. Status: Done. Tests: `timesheet.test.tsx`.
- **POC-FE-013** Manager approval queue and review (approve / reject with required reason). P0. Status: Done. Tests: `approvals.test.tsx`.
- **POC-FE-014** Projects and tasks (everyone reads; admin creates, edits, archives; tasks). P1. Status: Done. Tests: `projects.test.tsx`.
- **POC-FE-015** Finance/admin period locking (lock, unlock with reason). P0. Status: Done. Tests: `periods.test.tsx`.
- **POC-FE-016** Hours reports (contributor / project / month, filters, validation). P1. Status: Done. Tests: `reports.test.tsx`.
- **POC-FE-017** Project budget report. P1. Status: Done. Tests: `budget-report.test.tsx`.
- **POC-FE-018** Loading / validation / empty / error states across screens (AsyncView, stale-while-revalidate, field errors). P1. Status: Done (covered per screen).
- Phase acceptance verified (see phase-status.md). Not built: audit-trail screen, user administration, report export/charts.

## Phase 9 — Integration, Security and Final Quality
Status: tasks complete, pending phase approval. See ADR 0010, `docs/security.md` (Phase 9 section) and `docs/known-limitations.md`.
- **POC-QA-001** End-to-end workflow tests, frontend → backend → database (29 committed Playwright tests). P0. Status: Done.
- **POC-QA-002** Authentication/session/authorization review of the integrated system (independent review + e2e security spec); 7 findings fixed. P0. Status: Done.
- **POC-QA-003** Locked-period write rejection verified through the UI and by direct API calls (create/update/delete/move; admins not exempt; unlock + audit). P0. Status: Done.
- **POC-QA-004** Input validation and error handling review (179-payload live probe: 9 × 500 → 0; central NUL rejection). P0. Status: Done.
- **POC-QA-005** Time-zone and report accuracy (month-boundary data read from +14/−7/−11/UTC browsers; week, report, budget and API agree) and the final full quality run (backend/frontend checks, audits, builds, e2e), diff review and known limitations. P0. Status: Done.
- Phase acceptance verified (see phase-status.md).

## Phase 10 — Delivery and Walkthrough
Status: **delivery artifacts complete; Docker verification Blocked** (no container runtime on the development machine, installing one needs sudo). See ADR 0011, `docs/deployment.md`, `docs/walkthrough.md`.
- **POC-OPS-001** Docker Compose (db + migrate + backend + nginx web + demo seed), Dockerfiles, nginx config, role-separation init. P0. Status: **Blocked** - written and YAML-parsed, but `docker compose up` was never run. Acceptance not met until it is.
- **POC-OPS-002** Environment/secret documentation and clean-setup verification. P0. Status: Done for the local (non-Docker) path - followed `docs/deployment.md` section B literally on a clean copy with fresh databases (see phase-status.md); Docker path unverified.
- **POC-OPS-003** Architecture overview and important design decisions (`docs/architecture.md`, ADR 0011). P1. Status: Done.
- **POC-OPS-004** Walkthrough of the six required scenarios (manual script in `docs/walkthrough.md` + runnable `scripts/walkthrough.sh`, run against a production-mode stack: all outcomes observed). P0. Status: Done.
- **POC-OPS-005** Known limitations and future improvements (`docs/known-limitations.md`). P1. Status: Done.
- Remaining to close the project: run `docker compose config` and `docker compose up --build` on a machine with Docker, run `scripts/walkthrough.sh` against it, run the role-separation checks in `docs/deployment.md`, and fix whatever fails.

_Phases 1–10 are outlines; each is split into fully specified tasks (dependencies, acceptance criteria, test expectations, docs) when proposed for approval._
