# 0016. Admin approves when the owner has no usable manager

Status: Accepted. Amends ADR 0004 ("Submitting" and "Deciding"); requested by the project owner.

## Decision
- A submission is decided by the owner's **direct manager** when that manager is active and has role MANAGER.
- Otherwise (no manager assigned, manager deactivated, or no longer a MANAGER) it is decided by **any ADMIN other than the owner**.
- The rule is evaluated at decision time (`unmanagedOwnerWhere` in `authorization.service.ts`), so it follows later changes: deactivating a manager moves their pending reports' weeks to the admins; reassigning a manager moves them back.
- At submit time the week is refused (422) only if neither route exists: no usable manager **and** no other active admin. Without that check the week would stay frozen forever (the reason ADR 0004 required a manager).
- `GET /api/submissions?forApproval=true` is now open to ADMIN and lists only the admin-decidable submissions (never their own); managers' queue is unchanged. The `approvals.manager_id` column records whoever decided, including an admin.

## Trade-offs
- Every admin can decide every manager-less week (no per-admin assignment): simplest and never strands a week; there is no ownership among admins.
- An admin cannot approve their own week, so a lone admin cannot submit (422). This prevents self-approval of billable hours.
- Admins can already lock periods and read everything; this adds the ability to approve, only where no manager exists. It does not let admins override an existing manager's decision (404).
