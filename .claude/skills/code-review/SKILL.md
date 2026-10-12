---
name: code-review
description: Project code-review checklist for this POC — correctness, maintainability, security, performance, regressions and missing tests. Use when reviewing a diff without modifying it.
---

# Code review

Read-only: report findings, do not edit unless asked. Start with `git status` and `git diff`.

## Check, in order
1. **Correctness**: does it meet the task's acceptance criteria? Edge cases (week boundaries, empty sets, decimals, date handling)?
2. **Security**: apply the `security-review` checklist to any auth, permission or write path.
3. **Data integrity**: transactions where needed, lock checks on every write path, constraints/migrations safe.
4. **Layering**: no business logic in routes/controllers; no Prisma in controllers; validation present.
5. **Maintainability**: naming, size, duplication, needless abstraction or unrelated changes.
6. **Performance**: N+1 queries, missing indexes, in-memory aggregation.
7. **Tests**: positive and negative cases present and meaningful; docs and task status updated.

## Output
List findings grouped as **Blocker / Should fix / Nit**, each with `file:line`, the problem, and a suggested fix. Finish with what was verified (commands actually run) and what was not.
