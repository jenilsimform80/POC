---
name: backend-development
description: Express + TypeScript backend conventions for this POC — routes, controllers, services, middleware, Zod validation and error handling. Use when adding or changing backend endpoints.
---

# Backend development

## Layering (one responsibility each)
1. **Route** (`src/routes`): path + method + middleware chain (`authenticate`, `authorize`, `validate`). No logic.
2. **Controller** (`src/controllers`): read validated input, call a service, shape the HTTP response. No business rules, no Prisma.
3. **Service** (`src/services`): business rules, ownership/lock checks, transactions. Throws typed `AppError`s. Framework-agnostic (no `req`/`res`).
4. **Data access**: Prisma calls inside services (or small repository helpers if reused). Use `select` to return only needed fields.

## Checklist for a new endpoint
- Define the contract first in `docs/api-contracts.md` (method, path, auth, request, responses, errors).
- Zod schema for `body`, `params`, `query` in `src/validation`; use `validate` middleware; infer types with `z.infer`.
- Authenticate, then authorize by role, then check ownership/manager relationship in the service.
- Business failures throw `AppError(code, status, message)`; never `res.status().json()` an error ad hoc.
- Async handlers go through a wrapper so rejections reach the error middleware.
- Write positive and negative tests (see `testing-and-quality`).

## Error shape
`{ "error": { "code", "message", "details"? } }`. Statuses: 400 validation, 401 unauthenticated, 403 forbidden, 404 not found (also for resources the user may not know exist), 409 conflict/period locked, 422 business rule, 500 generic (log details server-side only).

## Rules
- Env via a Zod-validated config module; never read `process.env` elsewhere.
- No `any`; no secrets in logs; use `helmet`, CORS allow-list from config, body size limit.
- Keep handlers thin; avoid new abstractions until a pattern repeats 3 times.
