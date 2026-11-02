-- PHI Audit Log: acknowledgements / notes for harvest-during-PHI conflicts

CREATE TABLE IF NOT EXISTS phi_audit_acknowledgements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  harvest_id UUID NOT NULL REFERENCES harvests(id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES pesticide_applications(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'unreviewed'
    CHECK (status IN ('unreviewed', 'acknowledged', 'justified')),
  notes TEXT,
  acknowledged_by UUID REFERENCES users(id) ON DELETE SET NULL,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(harvest_id, application_id)
);

CREATE INDEX IF NOT EXISTS idx_phi_audit_ack_harvest ON phi_audit_acknowledgements(harvest_id);
CREATE INDEX IF NOT EXISTS idx_phi_audit_ack_application ON phi_audit_acknowledgements(application_id);
CREATE INDEX IF NOT EXISTS idx_phi_audit_ack_status ON phi_audit_acknowledgements(status);
