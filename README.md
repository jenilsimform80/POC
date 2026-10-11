# Timesheets and Project Billing (POC)

A full-stack POC for logging daily hours, weekly submission and approval, billing period locking, and project/budget reporting. The central engineering focus is **period locking and data integrity**.

## Status
Built in approved phases (0–10). Current state: see [tasks/phase-status.md](tasks/phase-status.md). Plan and tasks: [tasks/backlog.md](tasks/backlog.md).

Phases 1-2 added the backend foundation and the PostgreSQL/Prisma schema (no business endpoints yet). See `backend/README.md` to run it.

## Stack
React + TypeScript + Vite (frontend), Node.js + Express + TypeScript + Zod + Prisma (backend), PostgreSQL. Docker Compose arrives in Phase 10.

## Layout
- `docs/` — requirements, architecture, database design, API contracts, security, testing strategy, ADRs
- `tasks/` — backlog and phase status
- `.claude/` — project skills and slash commands for Claude Code
- `backend/` — Express API foundation (Phase 1); `frontend/` — created in Phase 7

## Workflow
Read [CLAUDE.md](CLAUDE.md). Each phase ends with a review report and requires explicit approval before the next begins.

## Note on requirements
[docs/requirements.md](docs/requirements.md) is derived from the project prompt only; the original specification has not been provided or verified.
