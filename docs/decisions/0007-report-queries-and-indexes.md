# 0007. Report queries and index decisions

Status: Accepted (Phase 6). Report visibility, the budget thresholds and "all logged hours (not only approved)" are ASSUMPTIONS (spec unverified).

## Design
- **Aggregation in PostgreSQL.** `GET /api/reports/hours` and `GET /api/reports/project-budgets` run one `SELECT ... GROUP BY` each (`src/services/report.service.ts`); no time entries are loaded into the application. Results are capped at 5000 rows (`truncated: true` if more).
- **Hours report:** `groupBy` is any non-empty, duplicate-free subset of `contributor`, `project`, `month`, so contributor, project and month totals (and their combinations) come from one endpoint. The dimensions map to fixed, whitelisted SQL fragments; the request only chooses among them. Every value (dates, ids, actor id) is a bound parameter. Range is required, inclusive at both ends, at most 1830 days.
- **Visibility:** contributor = own hours; manager = self + direct reports; admin = everyone (same rule as the rest of the API, `visibleEntriesSql` next to `visibleUsersWhere`). A `userId` filter outside the caller's scope is 404.
- **Budget report:** logged hours (all entries, billable and non-billable shown separately) vs `budget_hours` per project, `LEFT JOIN` so projects without hours appear, optional `through` date for month-end snapshots. Status: `WARNING` from 80 % used, `OVER` above 100 % (exactly 100 % is not over); a zero budget with any hours is `OVER`. **Admin only**: it compares all users' hours with a project-wide budget, and a team-scoped view would misstate it.

## Index review (measured, not guessed)
Method: throwaway database with 600 000 entries (300 users, 60 projects, ~2.75 years), `ANALYZE`, `EXPLAIN (ANALYZE, BUFFERS)`, best of 3 warm runs, PostgreSQL 14. The throwaway database was dropped afterwards.

| Query | Baseline | Plan |
|-------|----------|------|
| Admin, by month, 1 year | 73 ms | parallel seq scan (range is ~36 % of the table) |
| Manager (10 reports), contributor×project×month, 1 year | 32 ms | seq scan (the `OR` scope blocks the index) |
| Contributor, all time, by project | 10 ms | bitmap scan on `(user_id, work_date)` |
| Admin, contributor×project×month, full range | 494 ms | seq scan (reads every row, inherent) |
| Budget, lifetime / through date | 169 / 104 ms | seq scan (reads every row, inherent) |
| Admin, single project, 1 year | 13 ms | bitmap scan on `(project_id, work_date)` |

Candidates tested:
- Covering `(project_id) INCLUDE (hours, is_billable, work_date)` for the budget report: planner ignored it, no gain (needs every row anyway). **Rejected.**
- Covering `(work_date) INCLUDE (user_id, project_id, hours, is_billable)`: admin-by-month 73 → 56 ms for a 39 MB index (vs 5 MB for the plain one) and extra cost on every entry write. **Rejected.**
- **Adopted (no index, query change):** manager scope as `user_id IN (SELECT id FROM users WHERE id = me OR manager_id = me)` instead of `user_id = me OR u.manager_id = me`: 33 → 11.6 ms, now an index scan on `(user_id, work_date)`, and it scales with team size rather than table size. Results are identical (the visibility tests and the oracle comparison still pass).
- Existing indexes are all used and stay: `(user_id, work_date)` (138 scans in the run), `(work_date)` (24 scans; narrow month ranges and the lock-time snapshot use a bitmap index scan; without it the month snapshot takes a parallel seq scan), `(project_id, work_date)` (9 scans). No new index was added.

## Known limits
- Whole-table reports (admin full range, lifetime budget) are O(rows): ~0.5 s at 600 k entries. Acceptable for timesheets-billing; at much larger volumes the options are monthly rollup tables or a materialized view refreshed on lock. Not built (no requirement).
- The numbers are from one developer machine and synthetic uniform data; treat them as relative evidence, not a benchmark.
- Reports count all logged hours regardless of submission status. If billing must use approved hours only, add a submission-status filter (join on `(user_id, week_start)`); not requested.

## Evidence (tests, `backend/tests/reports.test.ts`, mutation-checked)
Hand-checked values; an independent in-test aggregation compared with the API for 8 groupings × 5 viewers; visibility, validation (incl. SQL-injection attempts), inclusive ranges, budget thresholds, zero-budget and archived handling, and time-zone independence. Mutations that were caught: widened manager scope, exclusive range end, missing billable filter, `LEFT JOIN`→`JOIN`, open budget route, time-zone-sensitive month bucketing.
