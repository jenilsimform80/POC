---
description: Run the relevant lint, type-check and test commands for the touched packages
argument-hint: [backend|frontend|all]
---

Run quality checks for: **${ARGUMENTS:-all}**

1. Find which packages exist (`backend/`, `frontend/`) and read their `package.json` scripts and README for the exact commands. If a package or script does not exist yet, say so; do not invent commands.
2. For each package run: type-check, lint, format check, tests.
3. Report each command with its actual result (pass/fail, counts). On failure, investigate the root cause and report it; fix only if asked or clearly within the current task.

Never claim a check passed unless it was run in this session.
