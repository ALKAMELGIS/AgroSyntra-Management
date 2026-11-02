-- Migration 168: operation manager approval of plantation closing rows.
--
-- The site's operation manager writes closing rows live (approved). Workers and
-- agronomists can import, add and edit closing rows, but what they save lands as
-- 'pending' until the site OM approves it, or 'rejected' with a reason the
-- submitter can correct (which sends it back to pending).
--
-- Every existing row stays approved.

ALTER TABLE plantation_closing_records
  ADD COLUMN IF NOT EXISTS approval_status VARCHAR(16) NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS submitted_by    UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS submitted_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by     UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS approved_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_reason TEXT,
  ADD COLUMN IF NOT EXISTS rejected_by     UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS rejected_at     TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'plantation_closing_records_approval_status_check'
  ) THEN
    ALTER TABLE plantation_closing_records
      ADD CONSTRAINT plantation_closing_records_approval_status_check
      CHECK (approval_status IN ('approved', 'pending', 'rejected'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_plantation_closing_records_unapproved
  ON plantation_closing_records (closing_sheet_id)
  WHERE approval_status <> 'approved';
