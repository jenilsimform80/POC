# 0013. OpenAPI document and Swagger UI

Status: Accepted (added after Phase 10 at the owner's request). Documentation only: no endpoint or business logic changed.

## Context
The API had a Markdown contract (`docs/api-contracts.md`) but nothing a developer could click through. The owner asked for Swagger UI at `/api-docs` and the OpenAPI JSON at `/api-docs.json`, matching the real cookie-session authentication, without drift from behaviour.

## Decisions
- **Spec is built in code, not a hand-maintained YAML.** `src/docs/` builds an OpenAPI 3.0.3 document. Request bodies, path and query parameters are generated with Zod's built-in `z.toJSONSchema` from the **same schemas the routes validate with**, so limits (max 24 h, quarter-hour steps, strict bodies, enums) cannot drift. No `zod-openapi`-style dependency was needed.
- **Response schemas and the endpoint list are written by hand** (`components.ts`, `operations.ts`); Zod cannot describe them because the services return plain objects. Drift is guarded by tests instead of trust: `tests/openapi.test.ts` (1) compares the routes registered in `src/routes/*.routes.ts` with the documented operations in both directions, (2) drives a full scenario through the real API as admin, manager and contributor and checks every response's status code is documented and its body matches the documented schema, including undocumented extra fields, and (3) asserts every operation is exercised. The tests were shown to fail when the spec is deliberately broken.
- **One new runtime dependency: `swagger-ui-express`** (+ `@types/swagger-ui-express`, dev). It bundles `swagger-ui-dist`, so the UI is served from our own origin: no CDN, no inline script, and the existing strict helmet CSP (`script-src 'self'`) works unchanged, which was verified in Chrome with no CSP violations. The alternative, a CDN-loaded page, would add a third-party script to an app that sends credentials. `swagger-ui-dist` depends on `@scarf/scarf`, whose install script sends anonymous usage telemetry; `scarfSettings.enabled=false` in `backend/package.json` turns that off. `npm audit` reports 0 vulnerabilities.
- **Authentication in the docs mirrors the implementation:** an `apiKey` security scheme `in: cookie`, named `sid` (`__Host-sid` in production, taken from `sessionCookieName`). Browsers do not let a page set a `Cookie` header, so the *Authorize* button cannot log you in; the supported flow is `POST /auth/login` via *Try it out*, after which the browser sends the HttpOnly cookie. The page says so.
- **Off in production by default.** `API_DOCS_ENABLED` unset means on outside production, off in production; `true`/`false` overrides. An unauthenticated map of every route, role and error is reconnaissance help, and a deployed instance should not publish it by accident. The bundled nginx only proxies `/api/`, so the Compose stack does not expose it either.
- **The CSRF Origin allow-list was not loosened for the docs page.** Write calls from Swagger UI send `Origin: http://localhost:3000`, which is refused (403) unless that origin is in `CORS_ORIGIN`. Allowing it automatically would have been simple but changes security behaviour; the setup step is documented instead.

## Alternatives
- Hand-written `openapi.yaml`: easy to read, but every validator change would silently desynchronise it.
- `zod-openapi` / `@asteasolutions/zod-to-openapi`: would also generate response schemas, but needs the responses expressed as Zod schemas (the services do not use them) and adds a dependency that must track Zod 4.
- Serving the docs under `/api/docs`: rejected to match the requested `/api-docs` paths and to keep `/api` purely the API.

## Consequences / follow-ups
- Adding or changing an endpoint now requires updating `src/docs/operations.ts` (the route-inventory test fails otherwise).
- Cross-field validation rules (for example `from <= to`, a contributor needs `managerId`) are described in prose, because JSON Schema from Zod cannot express `.refine`.
- Not done: realistic request examples per operation (Swagger shows placeholders such as `"string"`), and publishing the document anywhere beyond the running server.
