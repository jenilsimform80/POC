-- Phase 5: database-level guards. No table changes; Prisma cannot model triggers, so this
-- migration is hand-written (see docs/database-design.md "Period locking").

-- ---------------------------------------------------------------------------------------------
-- 1. Period lock: time_entries are immutable while their calendar month has a locked_periods row.
--
-- Race safety: under READ COMMITTED an in-flight edit cannot see a lock row that another
-- transaction has inserted but not yet committed, so "check, then write" alone is NOT enough.
-- Both sides therefore serialize on one advisory lock per month:
--   * every write to an entry takes the lock SHARED (many edits may run together) before checking;
--   * lock/unlock takes it EXCLUSIVE (waits for in-flight edits to commit, blocks new ones until
--     the lock row is committed, after which the check sees it).
-- The key text must match the application: 'period_lock:' || 'YYYY-MM'.
-- ---------------------------------------------------------------------------------------------
CREATE FUNCTION assert_period_unlocked(entry_date date) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  period text := to_char(entry_date, 'YYYY-MM');
BEGIN
  PERFORM pg_advisory_xact_lock_shared(hashtextextended('period_lock:' || period, 0));
  IF EXISTS (
    SELECT 1 FROM locked_periods
    WHERE period_start = date_trunc('month', entry_date)::date
  ) THEN
    RAISE EXCEPTION 'PERIOD_LOCKED: period % is locked', period USING ERRCODE = 'LK001';
  END IF;
END;
$$;

CREATE FUNCTION time_entries_enforce_period_lock() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- The row's current month (UPDATE/DELETE) and its new month (INSERT/UPDATE) must both be open,
  -- so entries can neither be changed in, moved out of, nor moved into a locked month.
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM assert_period_unlocked(OLD.work_date);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM assert_period_unlocked(NEW.work_date);
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER time_entries_period_lock
  BEFORE INSERT OR UPDATE OR DELETE ON "time_entries"
  FOR EACH ROW EXECUTE FUNCTION time_entries_enforce_period_lock();

-- ---------------------------------------------------------------------------------------------
-- 2. Audit trail is append-only: rows can be inserted, never changed or removed.
-- ---------------------------------------------------------------------------------------------
CREATE FUNCTION audit_logs_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'AUDIT_APPEND_ONLY: audit_logs rows cannot be % ', lower(TG_OP) USING ERRCODE = 'LK002';
END;
$$;

CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION audit_logs_append_only();
