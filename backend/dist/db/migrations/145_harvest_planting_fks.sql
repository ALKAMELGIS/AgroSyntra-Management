-- Link harvests to the planting cycle that occupied the field that day.
--
-- Two cycles of the same crop on the same ground must keep separate yields.
-- The FKs are nullable: a harvest that cannot be attributed uniquely (split
-- field, overlapping history, missing occupancy) stays unlinked rather than
-- guessed. ON DELETE SET NULL so removing a planting row never deletes harvest
-- history.
--
-- Occupancy window matches the uproot service: start is seeding_date on open
-- field and COALESCE(transplant_date, seeding_date) on planting_records; end is
-- uprooted_at inclusive, or unbounded while the row is still growing.
-- Same-day uproot and replant prefers the outgoing row (uprooted_at = harvest
-- date) over the incoming one.

ALTER TABLE harvests
  ADD COLUMN IF NOT EXISTS open_field_planting_id UUID REFERENCES open_field_planting(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS planting_record_id UUID REFERENCES planting_records(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'harvests_one_planting_source'
  ) THEN
    ALTER TABLE harvests
      ADD CONSTRAINT harvests_one_planting_source
      CHECK (NOT (open_field_planting_id IS NOT NULL AND planting_record_id IS NOT NULL));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_harvests_open_field_planting
  ON harvests(open_field_planting_id) WHERE open_field_planting_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_harvests_planting_record
  ON harvests(planting_record_id) WHERE planting_record_id IS NOT NULL;

-- Token helpers used only for the conservative backfill below. They follow the
-- write-path tokenizer (ALL, B#, V#, S) closely enough to overlap segments
-- without inventing valves. Dropped at the end of this file.

CREATE OR REPLACE FUNCTION harvest_canonicalize_segment_token(raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  trimmed text;
  m text[];
BEGIN
  trimmed := btrim(regexp_replace(COALESCE(raw, ''), '\s+', ' ', 'g'));
  IF trimmed = '' THEN
    RETURN '';
  END IF;
  IF trimmed ~* '^(all|all segments|\*)$' THEN
    RETURN 'ALL';
  END IF;
  m := regexp_match(trimmed, '^(?:b|bay)[-\s]*(\d+)$', 'i');
  IF m IS NOT NULL THEN
    RETURN 'B' || (m[1])::int::text;
  END IF;
  m := regexp_match(trimmed, '^(?:v|valve)[-\s]*(\d+)$', 'i');
  IF m IS NOT NULL THEN
    RETURN 'V' || (m[1])::int::text;
  END IF;
  m := regexp_match(trimmed, '^(?:s|spot)[-\s]*(\d*)$', 'i');
  IF m IS NOT NULL THEN
    IF m[1] IS NULL OR m[1] = '' THEN
      RETURN 'S';
    END IF;
    RETURN 'S' || (m[1])::int::text;
  END IF;
  RETURN trimmed;
END;
$$;

CREATE OR REPLACE FUNCTION harvest_parse_segment_tokens(seg text)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  part text;
  token text;
  tokens text[] := ARRAY[]::text[];
BEGIN
  FOREACH part IN ARRAY regexp_split_to_array(COALESCE(seg, ''), '[,&]+')
  LOOP
    token := harvest_canonicalize_segment_token(part);
    IF token = '' THEN
      CONTINUE;
    END IF;
    IF token = 'ALL' THEN
      RETURN ARRAY['ALL'];
    END IF;
    IF NOT token = ANY (tokens) THEN
      tokens := tokens || token;
    END IF;
  END LOOP;
  RETURN tokens;
END;
$$;

CREATE OR REPLACE FUNCTION harvest_segments_overlap(harvest_seg text, planting_seg text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  harvest_tokens text[] := harvest_parse_segment_tokens(harvest_seg);
  planting_tokens text[] := harvest_parse_segment_tokens(planting_seg);
BEGIN
  IF coalesce(array_length(harvest_tokens, 1), 0) = 0 THEN
    RETURN TRUE;
  END IF;
  IF coalesce(array_length(planting_tokens, 1), 0) = 0 THEN
    RETURN TRUE;
  END IF;
  IF 'ALL' = ANY (harvest_tokens) OR 'ALL' = ANY (planting_tokens) THEN
    RETURN TRUE;
  END IF;
  RETURN harvest_tokens && planting_tokens;
END;
$$;

WITH cands AS (
  SELECT h.id AS harvest_id,
         p.id AS ofp_id,
         NULL::uuid AS pr_id,
         CASE WHEN p.uprooted_at = h.date THEN 0 ELSE 1 END AS outgoing_rank
    FROM harvests h
    JOIN open_field_planting p ON p.field_id = h.field_id
   WHERE p.seeding_date <= h.date
     AND (p.uprooted_at IS NULL OR p.uprooted_at >= h.date)
     AND harvest_segments_overlap(h.segment_id, p.segment)
  UNION ALL
  SELECT h.id,
         NULL::uuid,
         p.id,
         CASE WHEN p.uprooted_at = h.date THEN 0 ELSE 1 END
    FROM harvests h
    JOIN planting_records p ON p.field_id = h.field_id
   WHERE COALESCE(p.transplant_date, p.seeding_date) <= h.date
     AND (p.uprooted_at IS NULL OR p.uprooted_at >= h.date)
     AND harvest_segments_overlap(h.segment_id, p.segment)
),
best AS (
  SELECT harvest_id, MIN(outgoing_rank) AS min_rank
    FROM cands
   GROUP BY harvest_id
),
winners AS (
  SELECT c.harvest_id, c.ofp_id, c.pr_id
    FROM cands c
    JOIN best b ON b.harvest_id = c.harvest_id AND c.outgoing_rank = b.min_rank
),
-- Unique winner without MIN(uuid): Postgres has no min(uuid), which is what
-- took production down on the first apply of this file. COUNT(*) = 1 is the
-- uniqueness test; the single row's FKs are the values to write.
unique_winners AS (
  SELECT harvest_id, ofp_id, pr_id
    FROM (
      SELECT harvest_id, ofp_id, pr_id,
             COUNT(*) OVER (PARTITION BY harvest_id) AS n
        FROM winners
    ) ranked
   WHERE n = 1
)
UPDATE harvests h
   SET open_field_planting_id = u.ofp_id,
       planting_record_id = u.pr_id
  FROM unique_winners u
 WHERE h.id = u.harvest_id
   AND h.open_field_planting_id IS NULL
   AND h.planting_record_id IS NULL;

DROP FUNCTION IF EXISTS harvest_segments_overlap(text, text);
DROP FUNCTION IF EXISTS harvest_parse_segment_tokens(text);
DROP FUNCTION IF EXISTS harvest_canonicalize_segment_token(text);
