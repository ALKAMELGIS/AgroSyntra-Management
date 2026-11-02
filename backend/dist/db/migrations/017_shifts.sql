-- Shift scheduling tables
CREATE TABLE IF NOT EXISTS shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  field_id UUID REFERENCES fields(id),
  shift_type VARCHAR(20) NOT NULL CHECK (shift_type IN ('morning', 'afternoon', 'night')),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  date DATE NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Shift templates for recurring schedules
CREATE TABLE IF NOT EXISTS shift_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  shift_type VARCHAR(20) NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  days_of_week INTEGER[] NOT NULL, -- 0=Sun, 1=Mon, ..., 6=Sat
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shifts_user ON shifts (user_id);
CREATE INDEX IF NOT EXISTS idx_shifts_field ON shifts (field_id);
CREATE INDEX IF NOT EXISTS idx_shifts_date ON shifts (date);
