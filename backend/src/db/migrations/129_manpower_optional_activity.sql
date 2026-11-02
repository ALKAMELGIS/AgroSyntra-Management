-- Allow optional activity on manpower records (summary / light-detail farms)

ALTER TABLE manpower_records
  ALTER COLUMN activity DROP NOT NULL;
