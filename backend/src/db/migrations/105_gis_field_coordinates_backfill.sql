-- Backfill field latitude/longitude/polygon from linked GIS features.
-- GIS auto-create stored geometry in gis_features but not on the fields row.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
    UPDATE fields f
    SET
      latitude = ROUND(ST_Y(ST_Centroid(gf.geometry))::numeric, 7),
      longitude = ROUND(ST_X(ST_Centroid(gf.geometry))::numeric, 7),
      polygon = gf.geometry,
      updated_at = NOW()
    FROM (
      SELECT DISTINCT ON (linked_field_id)
        linked_field_id,
        geometry
      FROM gis_features
      WHERE linked_field_id IS NOT NULL
        AND geometry IS NOT NULL
      ORDER BY linked_field_id, updated_at DESC
    ) gf
    WHERE gf.linked_field_id = f.id
      AND (f.latitude IS NULL OR f.longitude IS NULL);
  END IF;
END $$;
