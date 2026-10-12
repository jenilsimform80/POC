---
name: phase-completion-review
description: Verify a phase's acceptance criteria, inspect the Git diff, check documentation and produce the required phase completion report. Use at the end of every phase.
---

# Phase completion review

1. Read `tasks/phase-status.md` and the phase's tasks in `tasks/backlog.md`.
2. For each acceptance criterion, gather evidence by actually running the command or inspecting the file. Mark: Met / Not met / Not verified. Do not infer.
3. Run the quality gates for the touched packages (see `testing-and-quality`).
4. Inspect `git status` and `git diff`: unintended files, secrets, `.env`, leftover debug code, scope creep beyond the phase.
5. Check docs match behavior (`docs/*`, package READMEs) and task statuses are accurate (Done only if criteria and tests are verified).
6. Requirements honesty: `docs/requirements.md` is "Derived from prompt — original specification unverified" until the original spec is provided and reviewed. Do not state coverage verified against the spec.
7. Update `tasks/phase-status.md`.

## Report format
Phase Summary · Files Changed · Verification (commands + results) · Engineering Decisions (alternatives, trade-offs) · Outstanding Issues · Next Phase (prerequisites, tasks, acceptance criteria).

End with `**Phase status:** Complete / Blocked / Incomplete.` and `**Approval required:** Yes.` Then stop and wait for explicit approval.
