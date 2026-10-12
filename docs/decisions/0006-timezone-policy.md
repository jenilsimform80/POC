# 0006. Time zone policy: calendar dates are never converted

Status: Accepted (Phase 6). Assumption: the original spec is unverified; confirm that no per-user or per-project time zone is required.

## Policy
- **Business dates are calendar dates, not instants.** `work_date`, `week_start`, `period_start` and project `start_date`/`end_date` are PostgreSQL `DATE` columns. "8 hours on 2026-03-31" means that calendar day for everyone, wherever the user, server or database session is.
- **Wire format:** dates travel as `YYYY-MM-DD` strings in both directions. The API never accepts or returns a date with a time or an offset.
- **In the application:** a date is held as a `Date` at UTC midnight and only ever read with UTC accessors/`toISOString().slice(0, 10)` (`src/utils/dates.ts`). No local-time `Date` methods are used on business dates.
- **In SQL:** dates are bound as `'YYYY-MM-DD'` text cast to `DATE` (never as JS `Date` parameters, which the driver sends as timestamps that the session time zone could reinterpret). Month buckets use `to_char(work_date, 'YYYY-MM')` on the `DATE`, week buckets use ISO weeks starting Monday (`EXTRACT(ISODOW)` / `date_trunc('week')` semantics, CHECK on `week_start`), and a locked month is `date_trunc('month', work_date)::date`. All of these are independent of the session `TimeZone`.
- **Event timestamps** (`created_at`, `updated_at`, `submitted_at`, `decided_at`, `locked_at`, audit `created_at`, session expiry) are `timestamptz`, stored in UTC and returned as ISO-8601 with `Z`. They are for display and auditing only; no business rule depends on their calendar date.
- **Month / week boundaries** therefore never move: an entry on 2026-03-31 is in March and an entry on 2026-04-01 in April for every viewer. A week that spans a month end is split by date for locking (see ADR 0005).

## What this deliberately does not do
- It does not record *where* an entry was made, and it does not let a project define its own "business day" zone. If the spec needs "today" in a user's zone (e.g. to forbid future dates), that must be added explicitly, with the user's zone stored on the user.
- The server has no notion of "today" in any business rule today, so there is no cut-off or clock-dependent behaviour to get wrong.

## Evidence (tests, `backend/tests/reports.test.ts`)
- The same report is computed with the database session set to `UTC`, `Pacific/Kiritimati` (+14), `Pacific/Pago_Pago` (-11), `America/Los_Angeles` and `Asia/Kolkata`: results are identical.
- The report endpoint is called with the Node process in `Pacific/Auckland`: the 2026-03-31 total is unchanged.
- Mutation check: bucketing months through `timestamp ... AT TIME ZONE current_setting('TIMEZONE')` makes these tests fail.
- Boundary tests include 02-27/03-01 and 03-31/04-01 entries and inclusive range ends.

## Alternatives
Store `timestamptz` and convert per user (accurate for instants, but makes "which month is this hour in?" depend on a user setting and breaks locking/reporting consistency); store a zone per project (more flexible, but adds a rule nobody has asked for).
