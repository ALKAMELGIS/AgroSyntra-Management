-- Uproot lifecycle for plantings.
--
-- A planting row is the source of truth for which land is occupied: one row per
-- field/segment/crop/date. Uprooting frees that land for the next cycle without
-- deleting anything, so harvest, IPM, fertigation and manpower history all stay
-- attached to the cycle that produced them.
--
-- Both planting tables get the same columns because uproot mechanics are
-- identical for open field and for greenhouse/nethouse. The only difference is
-- how the occupancy start date is derived: open_field_planting uses
-- seeding_date, while planting_records uses COALESCE(transplant_date,
-- seeding_date), since a record that has been sown but not yet transplanted is
-- not occupying its field.

ALTER TABLE open_field_planting
  ADD COLUMN IF NOT EXISTS status        VARCHAR(20) NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS uprooted_at   DATE,
  ADD COLUMN IF NOT EXISTS uprooted_by   UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS uproot_reason TEXT;

ALTER TABLE planting_records
  ADD COLUMN IF NOT EXISTS status        VARCHAR(20) NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS uprooted_at   DATE,
  ADD COLUMN IF NOT EXISTS uprooted_by   UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS uproot_reason TEXT;

-- Only two states for now. End Season will reuse 'uprooted' with a reason
-- rather than adding a third, so a reopen can tell season closures apart from
-- deliberate cycle uproots.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'open_field_planting_status_check'
  ) THEN
    ALTER TABLE open_field_planting
      ADD CONSTRAINT open_field_planting_status_check
      CHECK (status IN ('active', 'uprooted'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'planting_records_status_check'
  ) THEN
    ALTER TABLE planting_records
      ADD CONSTRAINT planting_records_status_check
      CHECK (status IN ('active', 'uprooted'));
  END IF;
END $$;

-- An uprooted row must carry its date, and an active row must not.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'open_field_planting_uprooted_at_check'
  ) THEN
    ALTER TABLE open_field_planting
      ADD CONSTRAINT open_field_planting_uprooted_at_check
      CHECK ((status = 'uprooted') = (uprooted_at IS NOT NULL));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'planting_records_uprooted_at_check'
  ) THEN
    ALTER TABLE planting_records
      ADD CONSTRAINT planting_records_uprooted_at_check
      CHECK ((status = 'uprooted') = (uprooted_at IS NOT NULL));
  END IF;
END $$;

-- Occupancy lookups always filter to active rows for one field.
CREATE INDEX IF NOT EXISTS idx_ofp_field_active
  ON open_field_planting(field_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_planting_records_field_active
  ON planting_records(field_id) WHERE status = 'active';

-- Existing rows are all treated as still growing. Anything genuinely finished
-- gets uprooted through the UI, which records who did it and when; backfilling
-- a guess here would invent history.
