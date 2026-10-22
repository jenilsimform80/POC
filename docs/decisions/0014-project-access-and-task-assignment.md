# 0014. Restricted projects, task assignment and manager hierarchy

Status: Accepted (added after Phase 10 at the owner's request; awaiting review).

## Context
Three gaps were found while using the app: every project was visible to every user; managers could not create tasks or give work to a contributor; and a manager could not submit a timesheet because the rules forbade a manager from having a manager, so nobody could approve it.

## Decisions
- **Project visibility = a flag plus a member list**, not a permission system. `projects.is_restricted` (default false, so every existing project is unchanged) and `project_members`. Open projects stay open to every signed-in user; a restricted project is visible to admins and its members. The rule is one Prisma `where` (`accessibleProjectsWhere`), used in list, get, task writes and time-entry writes, so a hidden project answers 404, the same as a missing one (no IDOR leak). Managers do not automatically see their reports' projects: membership is explicit, which is easier to reason about.
- **Admin-only member management** (`memberIds` on project create/update replaces the list). Members must be active non-admin users. Removing a member blocks only *new* entries; their existing entries stay, because rewriting history would break reports, locked months and approved weeks.
- **Task assignment is an allow-list on the task** (`task_assignees`). No rows = everyone who can use the project, so existing tasks and the admin-only flow are unchanged. With rows, only those users may log time (422 otherwise). It is checked in the same transaction as the other entry rules, and only when an entry's project/task/date changes, so a rejected week can still be corrected after reassignment.
- **Managers may create tasks** on projects they can see, assigning only themself or their *active direct reports* (the same relationship the approval scope uses), and only members on restricted projects. A manager may change only tasks they created (`tasks.created_by_id`); admins may change any. The assignee list is shown only to people who manage the task.
- **Managers may report to another manager.** The "manager cannot have a manager" rule is dropped; a manager's manager must be an active manager, and loops (A→B→A, or self) are refused under the existing user-administration advisory lock. Approval already worked on `users.manager_id`, so only the upper manager can decide a manager's timesheet. The top manager still cannot submit; that is intentional (admins do not approve, ADR 0003).

## Alternatives
- Roles per project (project-manager, member…): more realistic, much more surface; rejected for timesheets-billing.
- Letting admins approve top-level managers: reverses a Phase 3 decision; not chosen.
- Auto-granting managers access to their reports' projects: implicit and hard to audit.

## Consequences / follow-ups
- Reports are still scoped by user, not by project membership: a manager sees their reports' hours on any project, including restricted ones the manager is not a member of. Decide whether that is acceptable.
- Existing tasks have no assignees; the unrestricted behaviour is unchanged until someone assigns.
- Not exercised: the browser e2e suite (needs the disposable e2e database) was not re-run after this change.
