-- Soil properties per field from global soil maps (OpenLandMap, 250 m),
-- sampled at a point inside the field polygon. A cache: it can be refreshed
-- at any time from the source and is never edited by hand.
CREATE TABLE IF NOT EXISTS field_soil_properties (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  field_id      uuid NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
  dataset       varchar(40) NOT NULL,
  depth_cm      smallint NOT NULL CHECK (depth_cm IN (0, 10, 30, 60, 100, 200)),
  value_num     numeric,
  value_text    varchar(40),
  unit          varchar(20),
  lon           numeric(10, 6),
  lat           numeric(10, 6),
  source        varchar(40) NOT NULL DEFAULT 'openlandmap',
  fetched_at    timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_field_soil_properties UNIQUE (field_id, dataset, depth_cm)
);
CREATE INDEX IF NOT EXISTS idx_field_soil_properties_org ON field_soil_properties (organization_id, field_id);
