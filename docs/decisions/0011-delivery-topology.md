# 0011. Delivery topology: Docker Compose, nginx, two database roles

Status: Accepted (Phase 10). **The Docker artifacts are written but were not executed** (no container runtime on the development machine, installing one needs `sudo`).

## Decisions
- **Four services + two one-shots.** `db` (PostgreSQL 14), `migrate` (one-shot), `backend`, `web` (nginx), and an optional `seed` (profile `demo`). Only `web` publishes a port; the API and database exist only on the internal network. Startup order is enforced with health checks and `service_completed_successfully`.
- **One origin.** nginx serves the SPA and proxies `/api/*`, so the session cookie stays first-party and CORS is irrelevant for users. nginx **overwrites** `X-Forwarded-For` with the address it sees, and the backend runs with `TRUST_PROXY=1` (exactly one hop), the combination that keeps login throttling correct and unspoofable (ADR 0010).
- **Security headers at the edge.** The SPA's static responses carry a strict CSP (`default-src 'self'`, no inline script/style, `frame-ancestors 'none'`), `nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options`, `Permissions-Policy`; source maps are deleted from the image and `*.map` returns 404; `index.html` is `no-cache`, hashed assets are immutable for a year. The backend sets its own headers on API responses (helmet, `no-store`).
- **Two database roles.** `timesheets_owner` (schema owner, used only by `migrate`) and `timesheets_app` (the running backend; `SELECT/INSERT/UPDATE/DELETE` via default privileges, not the owner, no `TRUNCATE`). This closes the documented limitation that the table owner could `DISABLE TRIGGER` the period-lock and audit guards. Passwords reach SQL as psql variables (safe quoting).
- **Images.** Multi-stage backend image: the runtime stage installs `npm ci --omit=dev --omit=optional` (**91 MB instead of 344 MB**, measured: npm otherwise pulls the Prisma CLI, TypeScript and react-dom in as an "optional peer"), runs as the unprivileged `node` user with a health check. The Prisma CLI lives only in the `build` stage, which the `migrate` and `seed` services reuse. The frontend runtime is `nginx-unprivileged`.
- **Fail-safe configuration.** `NODE_ENV=production` inside the container (Secure `__Host-` cookie); required secrets use `${VAR:?…}` so Compose refuses to start with missing values; `.env` is git-ignored.
- **Demo seeding is explicit.** The seed script refuses to run as production; the one-shot `seed` service sets `NODE_ENV=development` for itself only and requires `SEED_PASSWORD`.

## What was verified without Docker (and what was not)
Verified for real: `prisma migrate deploy` on an empty database; the production runtime install and `node dist/server.js` in `NODE_ENV=production` with a real environment and no `.env`; the whole Playwright suite plus `scripts/walkthrough.sh` against that backend behind a proxy emulator that applies the exact header values parsed from the real `security-headers.conf`; a clean-copy setup following `docs/deployment.md` section B. **Not verified:** that the Dockerfiles build, that Compose accepts the file semantically (it parses as YAML), nginx syntax, and the role-init SQL.

## Alternatives
Serving the SPA from the Express app (fewer containers, but static serving and security headers belong at the edge, and the backend image would carry the frontend build); one database role (simpler, but leaves the trigger-bypass limitation); Kubernetes manifests (out of scope for timesheets-billing).
