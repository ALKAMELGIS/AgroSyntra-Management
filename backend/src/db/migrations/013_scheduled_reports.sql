-- Scheduled reports
CREATE TABLE IF NOT EXISTS scheduled_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    report_type VARCHAR(50) NOT NULL,       -- harvest, fertigation, ecph, weather, summary
    filters JSONB DEFAULT '{}',              -- date range, fields, crops, etc.
    frequency VARCHAR(20) NOT NULL,          -- daily, weekly, monthly
    recipients TEXT[] NOT NULL,               -- email addresses
    last_sent TIMESTAMP WITH TIME ZONE,
    next_run TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_scheduled_reports_next ON scheduled_reports(next_run) WHERE is_active = true;
