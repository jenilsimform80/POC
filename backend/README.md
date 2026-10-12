# Backend

Express 5 + TypeScript (strict) REST API with PostgreSQL via Prisma. So far: foundation, schema, authentication (cookie sessions), role/ownership authorization, projects/tasks, time entries, weekly timesheets and the submission/approval workflow. Period locking (`docs/decisions/0005-period-lock-enforcement.md`), the audit trail and the reports (`GET /api/reports/hours`, `GET /api/reports/project-budgets`) are in place. The backend API is feature-complete; contracts are in `docs/api-contracts.md`. Endpoint contracts: `docs/api-contracts.md`; workflow rules: `docs/decisions/0004-timesheet-workflow-rules.md`.

## Requirements

Node.js >= 22.12, npm. (PostgreSQL arrives in Phase 2.)

## Setup

```bash
cd backend
npm install
cp .env.example .env   # adjust if needed; .env is git-ignored
```

## Database setup

Requires a local PostgreSQL role and two databases (`timesheets_dev`, `timesheets_test`). Create them once and fill in `DATABASE_URL` / `TEST_DATABASE_URL` in `.env` as described in [docs/database-design.md](../docs/database-design.md). Then:

```bash
npm run db:migrate        # applies migrations to the dev database
npm run db:migrate:test   # applies migrations to the test database (needed before npm test)
```

## Demo users (development only)

There is no registration API yet. Create demo users (admin, two managers, two contributors, all `@example.com`) with a password you choose:

```bash
SEED_PASSWORD='choose-12+-chars' npm run db:seed
```

Re-running updates the password. Then `POST /api/auth/login` with e.g. `dev1@example.com`. See `docs/api-contracts.md` for the endpoints and `docs/decisions/0003-session-strategy.md` for the design.

## Environment variables

| Name          | Default                 | Description                             |
| ------------- | ----------------------- | --------------------------------------- |
| `NODE_ENV`    | `development`           | `development`, `test` or `production`   |
| `PORT`        | `3000`                  | HTTP port (1-65535)                     |
| `CORS_ORIGIN` | `http://localhost:5173` | Comma-separated allowed browser origins |

Variables are validated with Zod at startup ([src/config/env.ts](src/config/env.ts)); invalid values stop the process with a readable error.

## Commands

| Command                           | Purpose                                |
| --------------------------------- | -------------------------------------- |
| `npm run dev`                     | Start with auto-reload (reads `.env`)  |
| `npm run build` / `npm start`     | Compile to `dist/` and run it          |
| `npm run typecheck`               | `tsc --noEmit`                         |
| `npm run lint`                    | ESLint (type-aware)                    |
| `npm run format` / `format:check` | Prettier write / check                 |
| `npm test`                        | Vitest (+ Supertest) once              |
| `npm run check`                   | typecheck + lint + format:check + test |

Verify: `curl http://localhost:3000/api/health` returns `{"status":"ok",...}`.

## Structure

```
src/
  config/       env parsing and validation
  routes/       URL + middleware wiring only
  controllers/  HTTP in/out, no business rules
  services/     business logic (transactions, rules): auth, authorization, project, time-entry, timesheet, submission
  middleware/   validate, error handler
  errors/       AppError and error codes
  validation/   Zod schemas (per feature, from Phase 3+)
  app.ts        createApp(env) - testable, no listen
  server.ts     process entry point
tests/          Vitest + Supertest
```

## Conventions

- Validate with `validate({ body, params, query })`; read parsed values via `getValidated(res)` (Express 5 makes `req.query` read-only).
- Throw `AppError(code, status, message, details?)` for expected failures; the central handler returns `{ "error": { "code", "message", "details"? } }` and a generic 500 for anything else.
- See `docs/decisions/0001-typescript-version.md` for the TypeScript version pin.
