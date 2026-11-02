-- Dedup table for PHI conflict alert notifications (initial + farm manager escalation)

CREATE TABLE IF NOT EXISTS phi_conflict_notifications (
  harvest_id UUID NOT NULL REFERENCES harvests(id) ON DELETE CASCADE,
  application_id UUID NOT NULL,
  notification_kind VARCHAR(24) NOT NULL CHECK (notification_kind IN ('initial', 'farm_manager')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (harvest_id, application_id, notification_kind)
);

CREATE INDEX IF NOT EXISTS idx_phi_conflict_notifications_created ON phi_conflict_notifications(created_at DESC);
