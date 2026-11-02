-- Migration 054: rename-safe GIS field matching.
--
-- Until now the GIS auto-link process matched ArcGIS features to fields
-- purely by Farm_Name. That means if the GIS team ever renames a polygon
-- (e.g. "Greenhouse 12" → "GH-12"), the next sync creates a duplicate
-- field row instead of updating the existing one, and every historical
-- EC/pH, scouting and harvest record stays on the orphaned original.
--
-- This migration adds a stable identifier (ArcGIS ObjectID / FID / GlobalID)
-- on the fields table. The sync code becomes:
--   1. Try to match by gis_external_id (stable across renames).
--   2. Fall back to name match (legacy behaviour, for fields that predate
--      this migration or features without an ObjectID).
--   3. On successful link, write the ObjectID back to the field so the
--      next sync short-circuits on step 1.
--
-- Safe to re-apply.

ALTER TABLE fields
  ADD COLUMN IF NOT EXISTS gis_external_id VARCHAR(255);

-- Only one field may be associated with a given external id. We allow
-- multiple NULLs (Postgres treats them as distinct by default on unique
-- indexes), so pre-migration fields without an id aren't affected.
CREATE UNIQUE INDEX IF NOT EXISTS ux_fields_gis_external_id
  ON fields (gis_external_id)
  WHERE gis_external_id IS NOT NULL;
