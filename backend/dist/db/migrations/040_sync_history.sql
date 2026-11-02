-- Sync history log for API integrations

CREATE TABLE IF NOT EXISTS api_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES api_integrations(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'partial', 'failed')),
  synced_count INT DEFAULT 0,
  skipped_count INT DEFAULT 0,
  error_count INT DEFAULT 0,
  errors JSONB DEFAULT '[]'::jsonb,
  triggered_by VARCHAR(20) DEFAULT 'manual' CHECK (triggered_by IN ('auto', 'manual'))
);

CREATE INDEX IF NOT EXISTS idx_api_sync_logs_integration ON api_sync_logs(integration_id);
CREATE INDEX IF NOT EXISTS idx_api_sync_logs_started ON api_sync_logs(started_at DESC);
