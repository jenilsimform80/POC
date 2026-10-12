# 0001. Pin TypeScript to 6.0.x

Status: Accepted (Phase 1)

Context: The newest stable TypeScript on npm is 7.0.x, but `typescript-eslint` 8.71 declares peer support for TypeScript `>=4.8.4 <6.1.0`. The brief asks for compatible stable releases.

Decision: Use `typescript@~6.0.3` (stable) and `@types/node@22` (matches the installed Node 22 and `engines`).

Alternatives: TypeScript 7 with an ignored peer warning (unsupported linting); dropping type-aware linting (loses useful checks).

Consequences: Revisit when typescript-eslint supports TypeScript 7. Other packages use the latest stable releases at install time (Express 5, Zod 4, Vitest 5, ESLint 10, Prettier 3).
