# Timesheets and Project Billing (POC)

Contributors log daily hours (billable or not) against projects and tasks and submit weekly timesheets; managers approve or reject their direct reports' weeks; finance/admin lock billing months so billed hours can never change; reports show hours by contributor, project and month and compare logged hours with each project's budget; important actions land in an append-only audit trail.

The engineering focus is **period locking and data integrity**: a locked month is immutable through the UI, direct API calls *and* raw SQL, including an edit racing the lock.

> **Requirements note.** `docs/requirements.md` is *"Derived from prompt - original specification unverified."* The original specification was never provided, so several policies are documented assumptions. See `docs/known-limitations.md` before relying on any rule.

## Quick start
| | Command | Notes |
|--|---------|-------|
| **Docker** | `cp .env.example .env` (fill the `CHANGE_ME`s) → `docker compose up --build` → http://localhost:8080 | Written but **not yet run** (no Docker on the dev machine); see `docs/deployment.md` for exactly what was and wasn't verified |
| **Local dev** | PostgreSQL + `npm ci` + `prisma migrate deploy` + `npm run dev` in `backend/` and `frontend/` | Verified from a clean copy; steps in `docs/deployment.md` (section B) |
| **Demo** | `BASE_URL=… DEMO_PASSWORD=… scripts/walkthrough.sh` | Runs and asserts the six required scenarios; manual UI script in `docs/walkthrough.md` |

## Stack
React 19 · TypeScript (strict) · Vite 8 · React Router 7 (frontend) | Node 22 · Express 5 · Zod · Prisma 7 · argon2 (backend) | PostgreSQL 14+ | nginx (serving + reverse proxy) | Vitest, Testing Library, Playwright.

## Repository
```
backend/    Express API, Prisma schema + migrations, seed/reset scripts, 285 tests
frontend/   React SPA, 186 unit/integration tests, 30 Playwright end-to-end tests, nginx config
docker/     PostgreSQL role-separation init script
scripts/    walkthrough.sh (runnable demo)
docs/       requirements, architecture, database, API contracts, security, testing, deployment, walkthrough, ADRs 0001-0011, known limitations
tasks/      backlog and phase status
.claude/    project skills and slash commands for Claude Code
```

## Documentation map
Architecture `docs/architecture.md` · Operations `docs/deployment.md` · Demo `docs/walkthrough.md` · API `docs/api-contracts.md` · Schema `docs/database-design.md` · Security `docs/security.md` · Tests `docs/testing-strategy.md` · Decisions `docs/decisions/` · Limits `docs/known-limitations.md` · Process `CLAUDE.md`, `tasks/`.

## Quality gates
`cd backend && npm run check` · `cd frontend && npm run check` · `cd frontend && npm run e2e` (real Chrome + real servers + a disposable `*_test` database). `npm audit`: 0 vulnerabilities in both packages.

## Status
All development phases (0-10) are complete **except verification of the Docker artifacts**, which needs a machine with Docker. Phase history and decisions: `tasks/phase-status.md`.
