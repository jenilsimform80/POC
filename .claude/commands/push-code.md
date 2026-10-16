---
description: Commit all current changes in logical, separate commits and push to origin/main
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git add:*), Bash(git commit:*), Bash(git push:*), Bash(git log:*)
---

The user has explicitly asked to commit and push the current changes. Optional focus from the user: $ARGUMENTS

1. Run `git status --short` and `git diff --stat`. If there is nothing to commit, say so and stop.
2. Check what would be staged (`git add -n -A`). Never stage `.env` files, keys, certificates or secrets; if anything looks sensitive, stop and ask. `.env.example` is fine.
3. Split the changes into separate, logical commits, in dependency order (for example: schema/migration, then backend, then frontend, then docs/task status). If $ARGUMENTS names a part (e.g. "backend only"), commit only that part and leave the rest uncommitted.
4. Commit messages: short, imperative, describing the change only. They must NOT mention Claude, AI, or any assistant, and must NOT include a Co-Authored-By line or any attribution trailer. The author is the configured git user.
5. Push to `origin main` after the commits (`git push origin main`). Never force-push, never rewrite history, never skip hooks.
6. Finish with `git log --format='%h %an %s'` for the new commits and `git status --short`, then report what was pushed and what was left out. Do not claim tests or builds passed unless they were actually run.
