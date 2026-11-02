-- Migration 115: Per-field sampling units for scouting infestation % calculation

CREATE TABLE IF NOT EXISTS field_sampling_units (
  field_id UUID PRIMARY KEY REFERENCES fields(id) ON DELETE CASCADE,
  sampling_units NUMERIC(10,2) NOT NULL CHECK (sampling_units > 0),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_field_sampling_units_field ON field_sampling_units(field_id);

-- Default NetHouse fields to 340 sampling units (agronomist can override per field)
INSERT INTO field_sampling_units (field_id, sampling_units)
SELECT f.id, 340
FROM fields f
JOIN field_types ft ON ft.id = f.field_type_id
WHERE f.deleted_at IS NULL
  AND LOWER(ft.name) LIKE '%net%'
ON CONFLICT (field_id) DO NOTHING;
