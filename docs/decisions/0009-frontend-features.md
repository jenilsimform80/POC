# 0009. Frontend features: structure, state handling and UI-vs-backend responsibilities

Status: Accepted (Phase 8). Builds on ADR 0008.

## Structure
Feature folders under `frontend/src/features/` (`timesheet`, `approvals`, `projects`, `periods`, `reports`) hold each screen with its small components; `src/api/` has one typed wrapper module per backend area; `src/auth/` has the session context and the route guards; `src/hooks/` has `useAsync`, `useMutation`, `combineAsync`; shared UI is in `src/components/ui/`. Routes are one table (`src/routes`).

## Decisions
- **Session and 401s.** `AuthProvider` asks `/auth/me` on load (the server session is the source of truth). A single handler registered in the API client reacts to **any** 401 (except login/session-check calls, where 401 is an expected answer) by dropping the user, and `RequireAuth` redirects to `/login` remembering the page (`state.from`, accepted only if it is an in-app path). **Sign-out only clears the user after the server confirmed**: if the request fails the session may still be valid, so the UI says so and stays signed in (shared computers).
- **Role-aware navigation is a convenience, never a control.** `auth/access.ts` decides which links/pages are shown; `RequireRole` shows "no access" instead of a screen the API would refuse. Tests check that guarded screens make **no** API call for the wrong role, but every permission is still enforced by the backend (it answers 403/404 regardless of the UI).
- **Reads: `useAsync`, `combineAsync`, `AsyncView`.** Every data-backed screen renders loading, error-with-retry, empty and success the same way. `reload()` keeps the previous data on screen while refreshing (stale-while-revalidate), so saving an entry does not blank the page or close open forms; a different loader or a reload after an error shows loading.
- **Writes: `useMutation` is the only place that catches.** Page-level handlers *reject* on failure; the form/row that invoked them shows the backend's message (and field-level errors from `VALIDATION_ERROR.details`) and stays open. (An early version wrapped results twice and closed forms on failure; tests caught it.)
- **Validation is mirrored, not trusted.** Forms check the obvious rules client-side (required fields, quarter-hour steps, 0–24 h, date order, mandatory reject/unlock reasons) for fast feedback and send nothing when invalid, but the backend's answer is always handled and shown (period locked, daily limit, week frozen, conflicts, scope errors). Edits send **only changed fields** (project and task together).
- **Dates are calendar dates.** `lib/dates.ts` does all arithmetic in UTC on date parts (no daylight-saving or zone drift) and formats deterministically; only "today" (default week/range) uses the browser's local date. Event timestamps are shown in the viewer's zone (ADR 0006).
- **Week view, not a project×day grid.** The backend allows several entries per project, task and day (different notes), so a grid cell would not map to a single entry. The timesheet shows each day with its entries, per-day totals, weekly/billable/non-billable totals and non-blocking backend warnings, and edits real entries (add, edit, delete with confirmation). Submission history lists past weeks with links.
- **No notifications.** The review screen says the contributor "will see the result on their timesheet" (no email/push exists).

## What the UI deliberately does not do
Enforce permissions, period locks, hour limits or workflow rules; it only mirrors them (hides buttons for frozen/locked weeks) and reports the backend's refusals. Drop the UI and every rule still holds.

## Known limitations
- The approval screen and reports show names only for people the viewer may see (others appear as "Team member"/"Archived project").
- Reports are run on demand (no export, no charts, no saved filters); results above 5000 rows are truncated by the backend and flagged.
- No audit-trail screen (the API exists; reading it is admin-only); no user administration screen.
- Entries on archived projects appear as "Archived project" (the active list does not carry them) but their hours/notes stay correctable.
- Nothing is cached across screens; each screen loads its own data.
