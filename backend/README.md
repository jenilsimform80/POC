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

Requires a local PostgreSQL role and one database (`timesheets_dev`). Create it once and fill in `DATABASE_URL` in `.env`. Tests and e2e use a sibling database, `timesheets_dev_test` (the name plus `_test`), which `npm run db:setup:test` creates and migrates automatically (it also runs before `npm test`) as described in [docs/database-design.md](../docs/database-design.md). Then:

```bash
npm run db:migrate        # applies migrations to the database
```

> `npm test` and the e2e suite empty only `timesheets_dev_test`; your development data is never touched.

```bash

```

## Demo users (development only)

There is no registration API yet. Create demo users (admin, two managers, two contributors, all `@example.com`) with a password you choose:

```bash
SEED_PASSWORD='choose-8+-chars' npm run db:seed
```

Re-running updates the password. Then `POST /api/auth/login` with e.g. `dev1@example.com`. See `docs/api-contracts.md` for the endpoints and `docs/decisions/0003-session-strategy.md` for the design.

## Environment variables

| Name               | Default                                  | Description                                           |
| ------------------ | ---------------------------------------- | ----------------------------------------------------- |
| `NODE_ENV`         | `development`                            | `development`, `test` or `production`                 |
| `PORT`             | `3000`                                   | HTTP port (1-65535)                                   |
| `FRONTEND_URL`     | `http://localhost:5173`                  | Comma-separated allowed browser origins               |
| `API_DOCS_ENABLED` | on outside production, off in production | `true`/`false`: serve Swagger UI and the OpenAPI JSON |

Variables are validated with Zod at startup ([src/config/env.ts](src/config/env.ts)); invalid values stop the process with a readable error.

## API documentation (Swagger UI)

With the backend running, open **http://localhost:3000/api-docs** (UI) or **http://localhost:3000/api-docs.json** (OpenAPI 3.0 document). They are served only outside production unless `API_DOCS_ENABLED=true`.

1. Expand `POST /auth/login`, click **Try it out**, enter a user (see _Demo users_) and **Execute**. The browser stores the HttpOnly session cookie and sends it on every later call. The _Authorize_ button is informational: Swagger UI cannot set a `Cookie` header itself.
2. Write calls (POST/PATCH/DELETE) from the page send `Origin: http://localhost:3000`, which the CSRF allow-list rejects (403) unless it is in `FRONTEND_URL`. Add it (`FRONTEND_URL=http://localhost:5173,http://localhost:3000`), restart, then log in on the docs page.

Request schemas are generated from the same Zod validators the routes use; response schemas live in [src/docs/components.ts](src/docs/components.ts) and the endpoint list in [src/docs/operations.ts](src/docs/operations.ts). `tests/openapi.test.ts` fails if a route is added without documentation or if a real response stops matching its documented schema. When you add or change an endpoint, update `src/docs/operations.ts` (and `components.ts` for a new response shape).

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
