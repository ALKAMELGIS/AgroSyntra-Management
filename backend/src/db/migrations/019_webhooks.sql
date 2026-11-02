-- Webhooks table
CREATE TABLE IF NOT EXISTS webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  url TEXT NOT NULL,
  secret VARCHAR(256) NOT NULL,
  events TEXT[] NOT NULL DEFAULT '{}', -- e.g., {'harvest.created', 'task.updated'}
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Webhook delivery log
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  status_code INTEGER,
  response TEXT,
  delivered_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhooks_user ON webhooks (user_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_active ON webhooks (is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON webhook_deliveries (webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_event ON webhook_deliveries (event);
