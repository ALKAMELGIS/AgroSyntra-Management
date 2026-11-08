-- 175: GIS link keys between AgroCloud and an ArcGIS structures layer
--
-- Hierarchy (built from the layer by the GIS sync):
--   Zone   (countries.code)  ← ZONE_ID
--   Site   (sites)           ← SITE / Site_Code
--   Farm area (farm_areas)   ← Structure_Type group inside a site
--   Field  (fields)          ← one feature = one structure (Farm_Name / Farm_Code)
--
-- Until now a field only kept the feature's GlobalID/OBJECTID (gis_external_id).
-- The business keys ZONE_ID + Farm_Code are stored too, so ArcGIS, Power BI and
-- AgroCloud can join on the same keys. Additive only; ArcGIS is never written to.

ALTER TABLE fields ADD COLUMN IF NOT EXISTS gis_zone_id   VARCHAR(100);
ALTER TABLE fields ADD COLUMN IF NOT EXISTS gis_farm_code VARCHAR(255);
ALTER TABLE fields ADD COLUMN IF NOT EXISTS gis_site_code VARCHAR(255);
ALTER TABLE fields ADD COLUMN IF NOT EXISTS gis_synced_at TIMESTAMPTZ;

ALTER TABLE sites ADD COLUMN IF NOT EXISTS gis_site_code  VARCHAR(255);

-- Result of the last layer inspection (fields, keys found, duplicates…).
ALTER TABLE gis_layers ADD COLUMN IF NOT EXISTS inspection   JSONB;
ALTER TABLE gis_layers ADD COLUMN IF NOT EXISTS inspected_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_fields_gis_keys
  ON fields (organization_id, UPPER(gis_zone_id), UPPER(gis_farm_code));
CREATE INDEX IF NOT EXISTS idx_fields_gis_external_id ON fields (gis_external_id);
CREATE INDEX IF NOT EXISTS idx_gis_features_linked_field ON gis_features (linked_field_id);

-- Fill the keys from features already linked to a field (only empty columns are filled).
UPDATE fields f
   SET gis_zone_id   = COALESCE(f.gis_zone_id,   NULLIF(TRIM(g.properties ->> COALESCE(l.attribute_mapping ->> 'zoneId',   'ZONE_ID')), '')),
       gis_farm_code = COALESCE(f.gis_farm_code, NULLIF(TRIM(g.properties ->> COALESCE(l.attribute_mapping ->> 'farmCode', 'Farm_Code')), '')),
       gis_site_code = COALESCE(f.gis_site_code, NULLIF(TRIM(g.properties ->> COALESCE(l.attribute_mapping ->> 'siteCode', 'Site_Code')), ''))
  FROM gis_features g
  JOIN gis_layers l ON l.id = g.layer_id
 WHERE g.linked_field_id = f.id
   AND (f.gis_zone_id IS NULL OR f.gis_farm_code IS NULL OR f.gis_site_code IS NULL);

-- One field per ZONE_ID + Farm_Code inside an organisation. Created only when the
-- current data is clean, so the migration cannot fail on an existing database;
-- bi.gis_link_issues lists any conflict to fix first.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM fields
     WHERE deleted_at IS NULL AND gis_zone_id IS NOT NULL AND gis_farm_code IS NOT NULL
     GROUP BY organization_id, UPPER(gis_zone_id), UPPER(gis_farm_code) HAVING COUNT(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_fields_gis_zone_farm_code
      ON fields (organization_id, UPPER(gis_zone_id), UPPER(gis_farm_code))
      WHERE deleted_at IS NULL AND gis_zone_id IS NOT NULL AND gis_farm_code IS NOT NULL;
  ELSE
    RAISE NOTICE 'fields share ZONE_ID + Farm_Code; unique index not created (see bi.gis_link_issues)';
  END IF;
END $$;

-- Location dimension now carries the GIS keys (new columns are appended).
CREATE OR REPLACE VIEW bi.dim_location AS
SELECT f.id AS field_id, f.name AS field_name, f.organization_id,
       fa.id AS farm_area_id, fa.name AS farm_area_name,
       s.id AS site_id, s.name AS site_name,
       c.id AS zone_uuid, c.code AS zone_code, c.name AS zone_name,
       ft.name AS field_type,
       f.gis_external_id,
       f.latitude, f.longitude,
       CASE WHEN f.polygon IS NOT NULL THEN ST_Y(ST_PointOnSurface(f.polygon)) END AS centroid_lat,
       CASE WHEN f.polygon IS NOT NULL THEN ST_X(ST_PointOnSurface(f.polygon)) END AS centroid_lon,
       f.deleted_at IS NOT NULL AS is_deleted,
       f.gis_zone_id, f.gis_farm_code, f.gis_site_code, s.gis_site_code AS site_gis_code,
       CASE WHEN f.gis_zone_id IS NOT NULL AND f.gis_farm_code IS NOT NULL
            THEN UPPER(f.gis_zone_id) || '|' || UPPER(f.gis_farm_code) END AS gis_link_key
  FROM fields f
  LEFT JOIN farm_areas fa ON fa.id = f.farm_area_id
  LEFT JOIN sites s ON s.id = fa.site_id
  LEFT JOIN countries c ON c.id = s.country_id
  LEFT JOIN field_types ft ON ft.id = f.field_type_id;

-- Everything that breaks a one-to-one link between features and fields.
CREATE OR REPLACE VIEW bi.gis_link_issues AS
WITH feats AS (
  SELECT g.id, g.layer_id, l.organization_id, g.linked_field_id,
         UPPER(NULLIF(TRIM(g.properties ->> COALESCE(l.attribute_mapping ->> 'zoneId',   'ZONE_ID')), ''))   AS zone_id,
         UPPER(NULLIF(TRIM(g.properties ->> COALESCE(l.attribute_mapping ->> 'farmCode', 'Farm_Code')), '')) AS farm_code
    FROM gis_features g JOIN gis_layers l ON l.id = g.layer_id
)
SELECT 'feature_missing_keys' AS issue, layer_id, organization_id, id AS feature_id, NULL::uuid AS field_id,
       zone_id, farm_code, 1::bigint AS occurrences
  FROM feats WHERE zone_id IS NULL OR farm_code IS NULL
UNION ALL
SELECT 'duplicate_feature_keys', layer_id, organization_id, NULL, NULL, zone_id, farm_code, COUNT(*)
  FROM feats WHERE zone_id IS NOT NULL AND farm_code IS NOT NULL
 GROUP BY layer_id, organization_id, zone_id, farm_code HAVING COUNT(*) > 1
UNION ALL
SELECT 'feature_not_linked', layer_id, organization_id, id, NULL, zone_id, farm_code, 1
  FROM feats WHERE linked_field_id IS NULL
UNION ALL
SELECT 'field_linked_to_many_features', NULL, NULL, NULL, linked_field_id, NULL, NULL, COUNT(*)
  FROM feats WHERE linked_field_id IS NOT NULL GROUP BY linked_field_id HAVING COUNT(*) > 1
UNION ALL
SELECT 'duplicate_field_keys', NULL, organization_id, NULL, NULL, UPPER(gis_zone_id), UPPER(gis_farm_code), COUNT(*)
  FROM fields WHERE deleted_at IS NULL AND gis_zone_id IS NOT NULL AND gis_farm_code IS NOT NULL
 GROUP BY organization_id, UPPER(gis_zone_id), UPPER(gis_farm_code) HAVING COUNT(*) > 1;

-- Re-create the bi views so bi.gis_key_forms (records per ZONE_ID + Farm_Code) appears.
SELECT bi.rebuild_views();
