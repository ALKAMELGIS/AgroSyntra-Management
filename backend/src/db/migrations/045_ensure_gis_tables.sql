-- Migration 045: Ensure GIS tables exist even if PostGIS is unavailable.
-- Migration 044 creates both gis_layers and gis_features in one transaction.
-- If gis_features fails (geometry type needs PostGIS), gis_layers rolls back too.
-- This migration creates gis_layers independently, then gis_features with a fallback.

-- Step 1: Ensure PostGIS extension exists (no-op if already there or unavailable)
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS "postgis";
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'PostGIS not available: %', SQLERRM;
END $$;

-- Step 2: gis_layers (no geometry dependency)
CREATE TABLE IF NOT EXISTS gis_layers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  source_type VARCHAR(50) NOT NULL CHECK (source_type IN ('arcgis_feature_service', 'file_upload')),
  source_url TEXT,
  layer_index INT,
  file_path TEXT,
  original_filename VARCHAR(500),
  geojson_data JSONB,
  style JSONB DEFAULT '{"color": "#3388ff", "weight": 2, "opacity": 0.8, "fillOpacity": 0.3}',
  attribute_mapping JSONB DEFAULT '{}',
  sync_interval_minutes INT DEFAULT 60,
  last_synced_at TIMESTAMPTZ,
  sync_status VARCHAR(30) DEFAULT 'pending',
  sync_error TEXT,
  is_visible BOOLEAN DEFAULT true,
  layer_order INT DEFAULT 0,
  auth_token TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gis_layers_source_type ON gis_layers(source_type);
CREATE INDEX IF NOT EXISTS idx_gis_layers_created_by ON gis_layers(created_by);

-- Step 3: gis_features (needs PostGIS geometry type — wrapped so failure is non-fatal)
DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS gis_features (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    layer_id UUID NOT NULL REFERENCES gis_layers(id) ON DELETE CASCADE,
    external_id VARCHAR(255),
    geometry geometry(Geometry, 4326) NOT NULL,
    properties JSONB DEFAULT '{}',
    linked_field_id UUID REFERENCES fields(id) ON DELETE SET NULL,
    linked_farm_area_id UUID REFERENCES farm_areas(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_gis_features_layer ON gis_features(layer_id);
  CREATE INDEX IF NOT EXISTS idx_gis_features_geom ON gis_features USING GIST(geometry);
  CREATE INDEX IF NOT EXISTS idx_gis_features_external_id ON gis_features(layer_id, external_id);
  CREATE INDEX IF NOT EXISTS idx_gis_features_linked_field ON gis_features(linked_field_id) WHERE linked_field_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_gis_features_linked_area ON gis_features(linked_farm_area_id) WHERE linked_farm_area_id IS NOT NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not create gis_features (PostGIS may be missing): %', SQLERRM;
END $$;
