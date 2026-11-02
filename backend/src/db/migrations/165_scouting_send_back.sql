-- Scouting reports can be sent back to the scouter by the pest agronomist.
-- Adds the 'returned' status plus the reason (review_notes) and when it happened.

-- The status CHECK was declared inline (023 / 030), so its name may vary by
-- environment. Drop every CHECK on scouting_reports that constrains status,
-- then add one well-known constraint.
DO $$
DECLARE
  con RECORD;
BEGIN
  FOR con IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE t.relname = 'scouting_reports'
      AND n.nspname = current_schema()
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE scouting_reports DROP CONSTRAINT IF EXISTS %I', con.conname);
  END LOOP;
END $$;

ALTER TABLE scouting_reports
  ADD CONSTRAINT scouting_reports_status_check
  CHECK (status IN ('submitted', 'reviewed', 'resolved', 'returned'));

ALTER TABLE scouting_reports ADD COLUMN IF NOT EXISTS review_notes TEXT;
ALTER TABLE scouting_reports ADD COLUMN IF NOT EXISTS returned_at TIMESTAMPTZ;
