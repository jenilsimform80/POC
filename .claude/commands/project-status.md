---
description: Show the active phase, task progress, blockers and the next approved action
allowed-tools: Read, Bash(git status:*), Bash(git log:*)
---

Read `tasks/phase-status.md` and `tasks/backlog.md`, and run `git status --short`.

Report concisely:
- Active phase and whether it is approved to proceed
- Task counts by status (Todo / In Progress / Blocked / Done) for the active phase
- Blockers and open decisions
- The next approved action (do not start it)

Do not modify any files.
