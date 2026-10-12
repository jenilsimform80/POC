# 0010. Phase 9 hardening decisions and end-to-end testing approach

Status: Accepted (Phase 9). Findings come from an independent read-only security review of the integrated system, my own hostile-input probing of the live API, and the end-to-end suite.

## Hardening decisions (each reproduced by a failing test before the fix)
| Finding | Decision |
|---------|----------|
| NUL (`\u0000`) in any text field made PostgreSQL reject the value → **HTTP 500** (entry notes, project/client/task names, lock note; also unlock reasons and approval comments) | One middleware (`reject-nul.ts`) rejects NUL in any JSON key/value and any `%00` in the URL with 400 `VALIDATION_ERROR`. Central, so future text fields are covered. Found by probing 179 hostile payloads against the live API; 9 produced 500, now 0. |
| Authenticated JSON had no cache directives (Express adds weak ETags; no `Cache-Control`/`Vary`) | `Cache-Control: no-store` and `Vary: Cookie` on every response, `app.disable('etag')`. |
| `NODE_ENV` defaulted to `development`, so a forgotten variable silently issued non-Secure cookies | Default is now **`production`** (fail-safe). Local dev sets `NODE_ENV=development` in `.env` explicitly (it is in `.env.example`). |
| Session cookie vulnerable to "cookie tossing" from a sibling subdomain | In production the cookie is named `__Host-sid` (browsers then require Secure, `Path=/`, no `Domain`); plain `sid` over HTTP in development. A plain `sid` cookie is ignored in production. |
| Login throttle wrong behind a reverse proxy (all clients share the proxy IP → trivial login DoS; or `trust proxy: true` → spoofable `X-Forwarded-For`) | New `TRUST_PROXY` = exact number of trusted proxy hops (default 0 = header ignored); the value `true` is rejected at startup. |
| Successful logins were never throttled (argon2 CPU/memory + one session row each) | Second limiter on **all** attempts (`LOGIN_ATTEMPT_LIMIT_MAX`, default 100 per window, per IP), in addition to the failed-attempts limiter. |
| Every signed-in user could read `budgetHours` through `GET /api/projects` although the budget report is admin-only | Allocated hours are omitted for non-admins in project list/detail (admins and project creation/update responses keep them). Client name stays visible: it is needed to recognise projects. **Owner decision point:** relax if contributors should see budgets. |

Accepted, not changed: requests without an `Origin` header are allowed (non-browser clients are not a CSRF vector; browsers always send `Origin` on cross-site writes and SameSite=Lax backs it up); the table-owner DB role can bypass triggers (ADR 0005); no background session cleanup.

## End-to-end tests
- **Real browser, real servers, disposable database.** Playwright (system Google Chrome) starts the real backend and Vite itself, against a `*_test` database that `global-setup` empties (`npm run db:reset:test`, which refuses any database not ending in `_test`) and seeds with a random per-run password. 29 tests in four specs: the business workflow through the UI (login redirect, admin setup, entries, the 24 h rule, submit/reject/resubmit/approve, report and budget values), period locking (UI plus direct API calls with the user's own session: create/update/delete/move all refused 409, admins not exempt, unlock needs a reason, both actions in the audit trail), security (anonymous refusal, HttpOnly cookie, replayed cookie dead after sign-out, IDOR, role scoping, approval rules, CSRF Origin check, XSS payload rendered as text, hostile input, no-store headers, no account enumeration) and time zones/report accuracy (the same month-boundary data read from browsers in UTC, +14:00, −07:00 and −11:00; week view, report, budget and API agree).
- **Why `127.0.0.1` in the e2e config:** Playwright's API request client adds a fixed ≈5.1 s delay to every request to `localhost` (measured 5.1 s vs 4 ms), which made the suite appear hung. The e2e backend therefore accepts both origins; real users still open `http://localhost:5173`.
- Mutation-checked: disabling the service-layer lock check is caught (the DB trigger still refuses the write, reported as `enforcedBy: "database"`); making day labels use the viewer's local zone fails the Los Angeles/Kiritimati runs; removing the CSRF Origin check fails the cross-site test.

## Alternatives
Allow `NODE_ENV` unset and refuse to start (stricter, but a fail-safe default is friendlier and equally safe); per-route NUL checks in Zod (misses future fields); rate limiting only at the proxy (the app should be safe on its own).
