-- Convert phi_end_date from DATE to TIMESTAMPTZ to support time-aware "Clear to Harvest"
ALTER TABLE pesticide_applications
  ALTER COLUMN phi_end_date TYPE TIMESTAMPTZ USING phi_end_date::timestamptz;
