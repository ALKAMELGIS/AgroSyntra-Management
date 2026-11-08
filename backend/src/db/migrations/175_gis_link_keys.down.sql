-- Reverses 175_gis_link_keys (keys and views only; ArcGIS and record data untouched).
DROP VIEW IF EXISTS bi.gis_key_forms;
DROP VIEW IF EXISTS bi.gis_link_issues;
DROP INDEX IF EXISTS uq_fields_gis_zone_farm_code;
DROP INDEX IF EXISTS idx_fields_gis_keys;
DROP INDEX IF EXISTS idx_fields_gis_external_id;
DROP INDEX IF EXISTS idx_gis_features_linked_field;
DROP VIEW IF EXISTS bi.dim_location;
ALTER TABLE fields DROP COLUMN IF EXISTS gis_zone_id;
ALTER TABLE fields DROP COLUMN IF EXISTS gis_farm_code;
ALTER TABLE fields DROP COLUMN IF EXISTS gis_site_code;
ALTER TABLE fields DROP COLUMN IF EXISTS gis_synced_at;
ALTER TABLE sites DROP COLUMN IF EXISTS gis_site_code;
ALTER TABLE gis_layers DROP COLUMN IF EXISTS inspection;
ALTER TABLE gis_layers DROP COLUMN IF EXISTS inspected_at;
