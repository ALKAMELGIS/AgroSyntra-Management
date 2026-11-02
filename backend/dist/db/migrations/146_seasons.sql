-- Planting seasons: a named date range per site.
--
-- Uproot frees land inside a season. End season (later) closes the year.
-- season_id lives only on the three tables that are a season fact:
-- open_field_planting, planting_records, crop_history. Other modules keep
-- filtering by site + date.
--
-- Idempotent on purpose. node-pg can apply earlier statements in this file
-- before a later one fails, and _migrations is only recorded after the whole
-- file succeeds. Do not use MIN(uuid)/MAX(uuid) — Postgres has no uuid
-- aggregates (see 145).

CREATE TABLE IF NOT EXISTS seasons (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id   UUID REFERENCES organizations(id),
    site_id           UUID NOT NULL REFERENCES sites(id),
    name              VARCHAR(64) NOT NULL,
    start_date        DATE NOT NULL,
    planned_end_date  DATE NOT NULL,
    end_date          DATE,
    status            VARCHAR(20) NOT NULL DEFAULT 'open',
    closed_at         TIMESTAMPTZ,
    closed_by         UUID REFERENCES users(id),
    reopened_at       TIMESTAMPTZ,
    reopened_by       UUID REFERENCES users(id),
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT seasons_status_check
      CHECK (status IN ('open', 'closed', 'reopen_pending')),
    CONSTRAINT seasons_dates_check
      CHECK (start_date <= planned_end_date),
    CONSTRAINT seasons_end_date_check
      CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_seasons_one_open_per_site
  ON seasons (site_id) WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_seasons_site
  ON seasons (site_id, start_date);

-- One open season per existing site, wide enough that no planting, rotation
-- or harvest date sits outside it. Default window is Sep–Jul (the farm year).
-- Sites that already have a season (retry after a partial apply) are skipped.

WITH date_span AS (
  SELECT site_id, MIN(d) AS min_d, MAX(d) AS max_d
  FROM (
    SELECT fa.site_id, ofp.seeding_date AS d
      FROM open_field_planting ofp
      JOIN fields f ON f.id = ofp.field_id
      JOIN farm_areas fa ON fa.id = f.farm_area_id
     WHERE ofp.seeding_date IS NOT NULL
    UNION ALL
    SELECT fa.site_id, ofp.uprooted_at
      FROM open_field_planting ofp
      JOIN fields f ON f.id = ofp.field_id
      JOIN farm_areas fa ON fa.id = f.farm_area_id
     WHERE ofp.uprooted_at IS NOT NULL
    UNION ALL
    SELECT fa.site_id, pr.seeding_date
      FROM planting_records pr
      JOIN fields f ON f.id = pr.field_id
      JOIN farm_areas fa ON fa.id = f.farm_area_id
     WHERE pr.seeding_date IS NOT NULL
    UNION ALL
    SELECT fa.site_id, pr.transplant_date
      FROM planting_records pr
      JOIN fields f ON f.id = pr.field_id
      JOIN farm_areas fa ON fa.id = f.farm_area_id
     WHERE pr.transplant_date IS NOT NULL
    UNION ALL
    SELECT fa.site_id, pr.uprooted_at
      FROM planting_records pr
      JOIN fields f ON f.id = pr.field_id
      JOIN farm_areas fa ON fa.id = f.farm_area_id
     WHERE pr.uprooted_at IS NOT NULL
    UNION ALL
    SELECT fa.site_id, ch.start_date
      FROM crop_history ch
      JOIN fields f ON f.id = ch.field_id
      JOIN farm_areas fa ON fa.id = f.farm_area_id
     WHERE ch.start_date IS NOT NULL
    UNION ALL
    SELECT fa.site_id, ch.end_date
      FROM crop_history ch
      JOIN fields f ON f.id = ch.field_id
      JOIN farm_areas fa ON fa.id = f.farm_area_id
     WHERE ch.end_date IS NOT NULL
    UNION ALL
    SELECT fa.site_id, h.date
      FROM harvests h
      JOIN fields f ON f.id = h.field_id
      JOIN farm_areas fa ON fa.id = f.farm_area_id
     WHERE h.date IS NOT NULL
  ) dates
  GROUP BY site_id
),
windows AS (
  SELECT
    s.id AS site_id,
    s.organization_id,
    CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 8
      THEN make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int, 9, 1)
      ELSE make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int - 1, 9, 1)
    END AS default_start,
    CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 8
      THEN make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int + 1, 7, 31)
      ELSE make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int, 7, 31)
    END AS default_end,
    ds.min_d,
    ds.max_d
  FROM sites s
  LEFT JOIN date_span ds ON ds.site_id = s.id
  WHERE s.deleted_at IS NULL
)
INSERT INTO seasons (organization_id, site_id, name, start_date, planned_end_date, status)
SELECT
  w.organization_id,
  w.site_id,
  EXTRACT(YEAR FROM LEAST(w.default_start, COALESCE(w.min_d, w.default_start)))::int::text
    || '-' ||
    EXTRACT(YEAR FROM GREATEST(w.default_end, COALESCE(w.max_d, w.default_end)))::int::text,
  LEAST(w.default_start, COALESCE(w.min_d, w.default_start)),
  GREATEST(w.default_end, COALESCE(w.max_d, w.default_end)),
  'open'
FROM windows w
WHERE NOT EXISTS (
  SELECT 1 FROM seasons existing WHERE existing.site_id = w.site_id
);

ALTER TABLE open_field_planting
  ADD COLUMN IF NOT EXISTS season_id UUID REFERENCES seasons(id),
  ADD COLUMN IF NOT EXISTS cycle_number INTEGER NOT NULL DEFAULT 1;

ALTER TABLE planting_records
  ADD COLUMN IF NOT EXISTS season_id UUID REFERENCES seasons(id),
  ADD COLUMN IF NOT EXISTS cycle_number INTEGER NOT NULL DEFAULT 1;

ALTER TABLE crop_history
  ADD COLUMN IF NOT EXISTS season_id UUID REFERENCES seasons(id);

CREATE INDEX IF NOT EXISTS idx_ofp_field_season_active
  ON open_field_planting (field_id, season_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_planting_records_field_season_active
  ON planting_records (field_id, season_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_crop_history_season
  ON crop_history (season_id) WHERE season_id IS NOT NULL;

-- Attach every field-backed row to that site's open season. Rows without a
-- field (nursery drafts) stay null.
UPDATE open_field_planting ofp
SET season_id = s.id
FROM fields f
JOIN farm_areas fa ON fa.id = f.farm_area_id
JOIN seasons s ON s.site_id = fa.site_id AND s.status = 'open'
WHERE ofp.field_id = f.id
  AND ofp.season_id IS NULL;

UPDATE planting_records pr
SET season_id = s.id
FROM fields f
JOIN farm_areas fa ON fa.id = f.farm_area_id
JOIN seasons s ON s.site_id = fa.site_id AND s.status = 'open'
WHERE pr.field_id = f.id
  AND pr.season_id IS NULL;

UPDATE crop_history ch
SET season_id = s.id
FROM fields f
JOIN farm_areas fa ON fa.id = f.farm_area_id
JOIN seasons s ON s.site_id = fa.site_id AND s.status = 'open'
WHERE ch.field_id = f.id
  AND ch.season_id IS NULL;

-- Cycle number is 1..n per (field, segment string, crop, season), oldest first.
-- ORDER BY id is only a tie-break — never MIN(uuid).
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY field_id, COALESCE(segment, ''), crop_id, season_id
           ORDER BY seeding_date NULLS LAST, created_at, id
         ) AS n
  FROM open_field_planting
  WHERE field_id IS NOT NULL AND season_id IS NOT NULL
)
UPDATE open_field_planting ofp
SET cycle_number = ranked.n
FROM ranked
WHERE ofp.id = ranked.id
  AND ofp.cycle_number IS DISTINCT FROM ranked.n;

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY field_id, COALESCE(segment, ''), crop_id, season_id
           ORDER BY COALESCE(transplant_date, seeding_date) NULLS LAST, created_at, id
         ) AS n
  FROM planting_records
  WHERE field_id IS NOT NULL AND season_id IS NOT NULL
)
UPDATE planting_records pr
SET cycle_number = ranked.n
FROM ranked
WHERE pr.id = ranked.id
  AND pr.cycle_number IS DISTINCT FROM ranked.n;
