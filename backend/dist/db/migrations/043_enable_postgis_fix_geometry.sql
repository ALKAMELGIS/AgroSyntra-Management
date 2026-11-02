-- Migration 043: Enable PostGIS and fix fields.polygon column type
-- The repository code uses ST_GeomFromText / ST_AsGeoJSON but the column was JSONB.
-- This migration enables PostGIS and converts the column to a proper geometry type.

CREATE EXTENSION IF NOT EXISTS "postgis";

-- Convert fields.polygon from JSONB to geometry(Geometry, 4326)
-- Uses DO block to handle both cases: JSONB data exists or column is empty
DO $$
BEGIN
  -- Check if the column is currently JSONB (not already geometry)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fields'
      AND column_name = 'polygon'
      AND udt_name NOT IN ('geometry', 'geography')
  ) THEN
    -- Convert existing JSONB data to geometry
    ALTER TABLE fields
      ALTER COLUMN polygon TYPE geometry(Geometry, 4326)
      USING CASE
        WHEN polygon IS NOT NULL AND polygon::text != 'null'
        THEN ST_SetSRID(ST_GeomFromGeoJSON(polygon::text), 4326)
        ELSE NULL
      END;
  END IF;
END $$;

-- Spatial index on fields.polygon
CREATE INDEX IF NOT EXISTS idx_fields_polygon_gist ON fields USING GIST(polygon);

-- Add geometry column to farm_areas for storing area boundaries
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'farm_areas' AND column_name = 'polygon'
  ) THEN
    ALTER TABLE farm_areas ADD COLUMN polygon geometry(Geometry, 4326);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_farm_areas_polygon_gist ON farm_areas USING GIST(polygon);

-- Auto-calculate area (m²) from polygon when polygon is set on fields
CREATE OR REPLACE FUNCTION fn_auto_calc_area()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.polygon IS NOT NULL THEN
    NEW.area := ROUND(ST_Area(NEW.polygon::geography)::numeric, 2);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fields_auto_area ON fields;
CREATE TRIGGER trg_fields_auto_area
  BEFORE INSERT OR UPDATE OF polygon ON fields
  FOR EACH ROW
  EXECUTE FUNCTION fn_auto_calc_area();
