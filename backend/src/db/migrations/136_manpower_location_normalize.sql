-- Normalize location matching (NH-03 vs NH 03) and relink historical manpower to field crops.

CREATE OR REPLACE FUNCTION normalize_manpower_location(t text)
RETURNS text AS $$
  SELECT LOWER(REGEXP_REPLACE(TRIM(COALESCE(t, '')), '[-\\s]+', ' ', 'g'));
$$ LANGUAGE sql IMMUTABLE;

-- Sync fields.current_crop_id from latest planting record per field (all sites)
WITH latest_planting AS (
  SELECT DISTINCT ON (pr.field_id)
    pr.field_id,
    pr.crop_id,
    pr.variety_id,
    pr.created_at
  FROM planting_records pr
  JOIN fields f ON f.id = pr.field_id AND f.deleted_at IS NULL
  WHERE pr.field_id IS NOT NULL
    AND pr.crop_id IS NOT NULL
  ORDER BY pr.field_id, pr.created_at DESC NULLS LAST, pr.id DESC
)
UPDATE fields f
SET current_crop_id = lp.crop_id,
    variety_id = CASE
      WHEN lp.variety_id IS NOT NULL THEN lp.variety_id
      ELSE f.variety_id
    END,
    updated_at = NOW()
FROM latest_planting lp
WHERE f.id = lp.field_id
  AND f.deleted_at IS NULL
  AND (f.current_crop_id IS DISTINCT FROM lp.crop_id
       OR (f.current_crop_id IS NULL AND lp.crop_id IS NOT NULL));

-- Normalize manpower location to canonical field name where normalized keys match
UPDATE manpower_records r
SET location = f.name,
    updated_at = NOW()
FROM fields f
WHERE r.deleted_at IS NULL
  AND NULLIF(TRIM(r.location), '') IS NOT NULL
  AND f.deleted_at IS NULL
  AND normalize_manpower_location(f.name) = normalize_manpower_location(r.location)
  AND TRIM(r.location) IS DISTINCT FROM TRIM(f.name);
