-- Team-leader activity submissions require approval before reports include them.

ALTER TABLE manpower_records
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'approved'
    CHECK (approval_status IN ('pending', 'approved', 'rejected'));

ALTER TABLE manpower_records
  ADD COLUMN IF NOT EXISTS submission_id UUID;

ALTER TABLE manpower_records
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id);

ALTER TABLE manpower_records
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

ALTER TABLE manpower_records
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_manpower_records_approval_status
  ON manpower_records(approval_status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_manpower_records_submission_id
  ON manpower_records(submission_id)
  WHERE submission_id IS NOT NULL;
