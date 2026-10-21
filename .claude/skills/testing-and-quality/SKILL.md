---
name: testing-and-quality
description: Testing approach and quality gates for Timesheets and Project Billing — unit, integration, negative and concurrency tests, coverage expectations and the lint/type-check/test gates. Use when writing tests or deciding if a task is done.
---

# Testing and quality

## Quality gates (all must pass before a task is Done)
Run from the relevant package (`backend/` or `frontend/`); exact script names are documented in that package's README once created:
1. Type-check (`tsc --noEmit`)
2. Lint (`eslint`) and format check (`prettier --check`)
3. Tests (`vitest run` or equivalent)
Report the actual commands and results; never claim a pass without running.

## Test types
- **Unit**: pure business rules (hour limits, week boundaries, status transitions) with no DB.
- **Integration** (Supertest + real test database): HTTP → middleware → service → DB. Use a separate test database; reset state between tests; never point tests at dev data.
- **Concurrency**: for locking, run lock and edit in parallel (`Promise.all`) many times and assert the invariant.
- **Frontend**: React Testing Library for behavior, not implementation details.

## Always include negative cases
Unauthenticated (401), wrong role (403), another user's record (403/404), invalid input (400), locked period create/update/delete (409), invalid state transitions, duplicate submissions.

## Practices
- Name tests by behavior ("rejects update of an entry in a locked period").
- Assert response body and persisted state (check the DB wasn't changed on rejection).
- Tests must demonstrate the actual enforcement layer (service vs DB).
- Coverage is a signal, not a goal: aim for the critical paths (auth, ownership, lock, aggregation) fully covered.
