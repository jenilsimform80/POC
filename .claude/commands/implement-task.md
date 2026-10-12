---
description: Implement one explicitly identified, approved task (usage - /implement-task POC-BE-001)
argument-hint: <task-id>
---

Implement exactly one task: **$ARGUMENTS**

1. Read `CLAUDE.md`, `tasks/phase-status.md` and the task in `tasks/backlog.md`. If the id is missing, unknown, or its phase is not approved in `phase-status.md`, stop and say so.
2. Check its dependencies are Done. If not, stop and report.
3. Inspect relevant existing code before editing; load the applicable skills in `.claude/skills/`.
4. Set the task to In Progress, implement in small steps, and write the tests listed in its test expectations.
5. Run the quality gates (type-check, lint, tests). Fix failures; report honestly.
6. Review the diff. Mark Done only if every acceptance criterion is verified; update related docs.
7. Summarize files changed, commands run with results, and decisions. Do not start another task, do not commit.
