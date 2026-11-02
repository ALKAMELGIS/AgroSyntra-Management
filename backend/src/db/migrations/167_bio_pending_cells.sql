-- Migration 167: pending (unapproved) values on biological-control cells.
--
-- per_m2 / units stay the APPROVED values and are the only ones any total,
-- summary, export or report reads. A scouter or data-entry worker writes the
-- pending_* columns instead; the pest agronomist approves (pending -> approved)
-- or rejects (pending cleared, reason kept for the person who entered it).
--
-- Every existing row keeps its values as approved. per_m2 / units were already
-- nullable (064), so a row may now hold only a pending value.

ALTER TABLE bio_record_entries
  ADD COLUMN IF NOT EXISTS pending_per_m2  NUMERIC,
  ADD COLUMN IF NOT EXISTS pending_units   NUMERIC,
  ADD COLUMN IF NOT EXISTS pending_clear   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pending_by      UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS pending_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_reason TEXT,
  ADD COLUMN IF NOT EXISTS rejected_by     UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS rejected_at     TIMESTAMPTZ;

ALTER TABLE bio_record_entries ALTER COLUMN per_m2 DROP NOT NULL;
ALTER TABLE bio_record_entries ALTER COLUMN units DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bio_record_entries_pending
  ON bio_record_entries (field_setup_id)
  WHERE pending_at IS NOT NULL;
