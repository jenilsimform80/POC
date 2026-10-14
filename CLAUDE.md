# Timesheets and Project Billing — POC

Full-stack POC: contributors log hours against projects/tasks, submit weekly timesheets, managers approve/reject, finance/admin lock billing periods, reports show hours and budget usage. **Core challenge: period locking and data integrity** — locked periods must be immutable via every write path (UI, API, and ideally the database).

The owner is learning: explain significant decisions and trade-offs, and challenge unsafe or over-complicated approaches.

## Stack
- Frontend (`frontend/`): React, TypeScript strict, Vite, React Router, React Testing Library.
- Backend (`backend/`): Node.js, Express, TypeScript strict, REST, Zod, Prisma, PostgreSQL, Vitest/Jest + Supertest.
- Tools: npm, ESLint, Prettier, local PostgreSQL (pgAdmin 4 for inspection). Docker Compose is a Phase 10 deliverable.
- Use stable releases only (no prerelease/RC). Justify every new dependency.

## Phase rules (most important)
- Work proceeds in phases 0–10; the plan is in `.claude/tasks/backlog.md`, status in `.claude/tasks/phase-status.md`.
- Implement ONLY the currently approved phase. At phase end: stop, write the completion report (Summary, Files Changed, Verification, Decisions, Outstanding Issues, Next Phase, Phase status, "Approval required: Yes"), and wait for explicit approval.
- One task at a time. Mark a task Done only after its acceptance criteria and tests are verified.
- Never claim a test/build/migration/command passed unless it was actually run.
- Requirements source: `docs/requirements.md` is **"Derived from prompt — original specification unverified."** Never state a requirement is verified against the original spec unless that spec was provided and reviewed.
- Never commit, push, open PRs, delete data, or do anything destructive without explicit permission. Inspect before editing; summarize after editing.

## Folder responsibilities
- `backend/src/routes` (URL + middleware wiring) → `controllers` (HTTP in/out only) → `services` (business rules, transactions) → data access via Prisma. `middleware/` for auth, validation, errors. `validation/` for Zod schemas.
- `frontend/src`: feature-based folders; one centralized API client; UI is never the security boundary.
- `docs/` design docs and ADRs (`docs/decisions/`); `.claude/tasks/` backlog and phase status; `.claude/skills|commands` workflows.

## Conventions
- TypeScript strict; no unneeded `any`. camelCase vars/functions, PascalCase types/components, kebab-case file names for non-components, snake_case DB columns mapped via Prisma `@map`.
- No hardcoded secrets or environment URLs; validate env with Zod at startup; keep `.env.example` current and `.env` ignored.
- Small, reviewable changes; no unrelated refactors or features.

## Security and validation
- Validate every request (body, params, query) with Zod. Enforce authentication, role, ownership and manager-report checks on the backend for every route.
- Prevent IDOR: scope queries by the authenticated user/relationship; return 404/403 consistently.
- Period lock is enforced on every create/update/delete path, inside transactions with concurrency control; see `security-review` skill.

## API errors
Consistent JSON shape: `{ "error": { "code": "STRING_CODE", "message": "human text", "details"?: ... } }` with correct HTTP status (400 validation, 401, 403, 404, 409 conflict/lock, 422 business rule, 500 generic with no internals leaked). Centralized error middleware only.

## Database
- Prisma migrations only; never edit an applied migration — add a new one. Review generated SQL. Use transactions for multi-step integrity. Dates for entries are `DATE` (no time zone); timezone policy is decided in Phase 6.

## Frontend rules
- All API access goes through `frontend/src/api/client.ts` (never call `fetch` elsewhere). Data-backed views use `useAsync` + `AsyncView` (loading, error with retry, empty, success). Show users `ApiError.message` or generic text only. The UI is never a security boundary. Dev: open `http://localhost:5173`, not `127.0.0.1`.

## Testing and quality gates
End-to-end browser tests: `cd frontend && npm run e2e` (disposable `*_test` database only; see `frontend/README.md`).
Before a task is Done: type-check, lint, and relevant tests pass; add positive and negative tests for business rules (auth, ownership, lock). See `testing-and-quality` skill and `docs/testing-strategy.md`.

## Documentation
Update docs and task status when work is genuinely complete: `docs/api-contracts.md` per API, `docs/database-design.md` per schema change, ADRs for significant decisions.

## Skills and commands
Skills in `.claude/skills/` (backend-development, database-and-prisma, security-review, testing-and-quality, code-review, phase-completion-review). Commands in `.claude/commands/` (/project-status, /implement-task, /review-changes, /run-quality-checks, /phase-review, /next-phase).
