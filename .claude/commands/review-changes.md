---
description: Review current changes without modifying anything
allowed-tools: Read, Grep, Glob, Bash(git status:*), Bash(git diff:*), Bash(git log:*)
---

Review the current working-tree changes (`git status`, `git diff`, plus untracked files) using the `code-review` skill and, for auth, permission or write paths, the `security-review` skill.

Report findings grouped as Blocker / Should fix / Nit with `file:line`, and state what was verified versus not. Do not edit files.
