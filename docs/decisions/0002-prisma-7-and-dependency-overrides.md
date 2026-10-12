# 0002. Prisma 7 with the pg adapter and two dependency overrides

Status: Accepted (Phase 2)

Context: Prisma 7.10.0 is the current stable release. It requires `prisma.config.ts` and a driver adapter (`@prisma/adapter-pg`). `npm audit` reported 4 high-severity advisories in `mysql2` and `deepmerge-ts`, both transitive dependencies of the Prisma CLI (dev tool; this project uses PostgreSQL only). The suggested `npm audit fix --force` would downgrade Prisma to 6.x.

Decision: Stay on Prisma 7.10.0 and add npm `overrides` in `backend/package.json` for `deepmerge-ts` (^8.0.2) and `mysql2` (^3.24.5). Verified afterwards: `npm audit` reports 0 vulnerabilities; `prisma validate`, `generate`, `migrate dev` and `migrate deploy` all work.

Alternatives: downgrade to Prisma 6 (older major, breaks the 7 config model); accept the advisories (they are not reachable at runtime but remain noise).

Consequences: Overrides force versions the Prisma CLI was not tested with. Re-check after each Prisma upgrade and remove the overrides once Prisma ships patched dependencies.
