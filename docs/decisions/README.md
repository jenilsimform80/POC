# Architecture Decision Records

One short file per significant decision: `NNNN-title.md`.

## Template
```
# NNNN. Title
Status: Proposed | Accepted | Superseded
Context: what forces the decision
Decision: what we chose
Alternatives: what else was considered
Consequences: trade-offs and follow-ups
```

## Index
| ID | Decision | Status |
|----|----------|--------|
| 0001 | [Pin TypeScript to 6.0.x](0001-typescript-version.md) | Accepted |
| 0002 | [Prisma 7 with pg adapter and dependency overrides](0002-prisma-7-and-dependency-overrides.md) | Accepted |
| 0003 | [Server-side cookie sessions with argon2id](0003-session-strategy.md) | Accepted |
| 0004 | [Timesheet workflow rules and per-user write serialization](0004-timesheet-workflow-rules.md) | Accepted |
| 0005 | [Period locking: two layers + shared/exclusive advisory lock](0005-period-lock-enforcement.md) | Accepted |
| 0006 | [Time zone policy: calendar dates are never converted](0006-timezone-policy.md) | Accepted |
| 0007 | [Report queries and index decisions](0007-report-queries-and-indexes.md) | Accepted |
| 0008 | [Frontend foundation: stack, API access, pinned versions](0008-frontend-foundation.md) | Accepted |
| 0009 | [Frontend features: structure, state handling, UI-vs-backend](0009-frontend-features.md) | Accepted |
| 0010 | [Phase 9 hardening decisions and e2e approach](0010-phase-9-hardening-and-e2e.md) | Accepted |
| 0011 | [Delivery topology: Docker Compose, nginx, two database roles](0011-delivery-topology.md) | Accepted (Docker artifacts unexecuted) |

No further decisions are planned.

## Phase 0 decisions (recorded in `.claude/tasks/phase-status.md`)
Workspace root layout (no nested `poc/`), Git remote configured without pushing, requirements derived from the prompt only.
