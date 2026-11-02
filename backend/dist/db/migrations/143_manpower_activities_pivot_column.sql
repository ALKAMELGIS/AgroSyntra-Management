-- Map catalog activity names to Workers count grid column keys.

ALTER TABLE manpower_activities
  ADD COLUMN IF NOT EXISTS pivot_column VARCHAR(50);

ALTER TABLE manpower_activities DROP CONSTRAINT IF EXISTS manpower_activities_pivot_column_check;
ALTER TABLE manpower_activities ADD CONSTRAINT manpower_activities_pivot_column_check
  CHECK (
    pivot_column IS NULL OR pivot_column IN (
      'Supervisor', 'Operator', 'Irrigation', 'IPM', 'Maintenance', 'Nursary',
      'Crate Washing', 'Hook Making', 'Uprooting/Cleaning', 'Bed Making/Mulching',
      'Planting', 'Clipping', 'Trellising', 'Pruning', 'Lowering', 'Weeding', 'Harvesting'
    )
  );

-- Exact and fuzzy-matched catalog rows
UPDATE manpower_activities SET pivot_column = 'Supervisor' WHERE name = 'Supervisor';
UPDATE manpower_activities SET pivot_column = 'Harvesting' WHERE name = 'Harvesting';
UPDATE manpower_activities SET pivot_column = 'Maintenance' WHERE name = 'Maintenance';
UPDATE manpower_activities SET pivot_column = 'Lowering' WHERE name = 'Lowering';
UPDATE manpower_activities SET pivot_column = 'Hook Making' WHERE name = 'Hook Making';
UPDATE manpower_activities SET pivot_column = 'Weeding' WHERE name = 'Weeding & Cleaning';
UPDATE manpower_activities SET pivot_column = 'Irrigation' WHERE name = 'Irrigation & Other Job Working';
UPDATE manpower_activities SET pivot_column = 'Irrigation' WHERE name = 'Irrigation & Plant Checking';
UPDATE manpower_activities SET pivot_column = 'Trellising' WHERE name = 'Side Shoot Trellising';
UPDATE manpower_activities SET pivot_column = 'Pruning' WHERE name = 'Leaf Pruning';
UPDATE manpower_activities SET pivot_column = 'Planting' WHERE name = 'Fig Planting';
UPDATE manpower_activities SET pivot_column = 'Operator' WHERE name = 'Operator Manitou';
UPDATE manpower_activities SET pivot_column = 'Supervisor' WHERE name = 'Spray Supervisor';

-- Misfiled by fuzzy matcher — correct mapping
UPDATE manpower_activities SET pivot_column = 'Crate Washing' WHERE name = 'Harvesting Crates Cleaning';
UPDATE manpower_activities SET pivot_column = 'Crate Washing' WHERE name = 'Harvesting Crates/Pallet Arranging';
UPDATE manpower_activities SET pivot_column = 'Operator' WHERE name = 'Irrigation Operator & fertigation Mixing';

-- Genuinely unmapped names → explicit grid column where applicable
UPDATE manpower_activities SET pivot_column = 'Uprooting/Cleaning' WHERE name = 'Uprooting, Rope Cutting & Plant Arrange';
UPDATE manpower_activities SET pivot_column = 'Hook Making' WHERE name = 'Hook Collection & Loading';
UPDATE manpower_activities SET pivot_column = 'Bed Making/Mulching' WHERE name = 'Bed Preparation';

-- Remaining seed activities stay NULL (Other column on frontend)
