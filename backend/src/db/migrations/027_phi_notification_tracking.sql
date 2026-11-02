-- Track which PHI notifications have been sent to avoid duplicates
ALTER TABLE pesticide_applications
  ADD COLUMN IF NOT EXISTS phi_day_before_sent BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS phi_cleared_sent BOOLEAN DEFAULT false;
