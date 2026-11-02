-- Alert rules - configurable thresholds
CREATE TABLE IF NOT EXISTS alert_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,           -- harvest, fertigation, ecph_reading, weather
    metric VARCHAR(100) NOT NULL,               -- ec, ph, water_usage, harvest_quantity, temperature
    operator VARCHAR(10) NOT NULL DEFAULT '>',  -- >, <, >=, <=, ==, !=
    threshold DECIMAL(10,2) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'warning',  -- info, warning, critical
    notify_roles TEXT[] DEFAULT ARRAY['ceo','farm_manager','operation_manager'],
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Alert events - triggered instances
CREATE TABLE IF NOT EXISTS alert_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id UUID REFERENCES alert_rules(id) ON DELETE SET NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID,
    field_id UUID REFERENCES fields(id) ON DELETE SET NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'warning',
    title VARCHAR(500) NOT NULL,
    message TEXT NOT NULL,
    value DECIMAL(10,2),
    acknowledged_by UUID REFERENCES users(id),
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- In-app notifications for users
CREATE TABLE IF NOT EXISTS user_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    alert_event_id UUID REFERENCES alert_events(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    message TEXT NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'info',
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Alert preferences per user
CREATE TABLE IF NOT EXISTS alert_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    alert_type VARCHAR(50) NOT NULL,    -- e.g. 'ec_high', 'ph_low', 'harvest_low'
    in_app BOOLEAN DEFAULT true,
    email BOOLEAN DEFAULT false,
    push BOOLEAN DEFAULT false,
    UNIQUE(user_id, alert_type)
);

-- Indexes
CREATE INDEX idx_alert_rules_active ON alert_rules(is_active) WHERE is_active = true;
CREATE INDEX idx_alert_events_created ON alert_events(created_at DESC);
CREATE INDEX idx_alert_events_entity ON alert_events(entity_type, entity_id);
CREATE INDEX idx_user_notifications_user ON user_notifications(user_id, is_read, created_at DESC);

-- Seed default alert rules
INSERT INTO alert_rules (name, entity_type, metric, operator, threshold, severity) VALUES
  ('EC Too High', 'ecph_reading', 'ec', '>', 3.0, 'warning'),
  ('EC Too Low', 'ecph_reading', 'ec', '<', 1.0, 'warning'),
  ('pH Too High', 'ecph_reading', 'ph', '>', 7.0, 'critical'),
  ('pH Too Low', 'ecph_reading', 'ph', '<', 5.5, 'critical'),
  ('Low Harvest Yield', 'harvest', 'total_quantity', '<', 10.0, 'info'),
  ('High Drain Percentage', 'ecph_reading', 'percent_drain', '>', 40.0, 'warning')
ON CONFLICT DO NOTHING;
