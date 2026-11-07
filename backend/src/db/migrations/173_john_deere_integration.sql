-- John Deere Operations Center connection (one per AgroCloud organization).
--
-- environment: 'sandbox'    -> https://sandboxapi.deere.com/platform  (Deere app not yet approved for production)
--              'production' -> https://partnerapi.deere.com/platform
-- Client secret and OAuth tokens are stored encrypted (AES-256-GCM, see utils/secretBox.ts);
-- the API never returns them.
CREATE TABLE IF NOT EXISTS john_deere_connections (
  organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  environment VARCHAR(20) NOT NULL DEFAULT 'sandbox',
  client_id VARCHAR(200),
  client_secret_enc TEXT,
  redirect_uri TEXT,
  scopes TEXT NOT NULL DEFAULT 'openid profile offline_access ag1',
  access_token_enc TEXT,
  refresh_token_enc TEXT,
  token_expires_at TIMESTAMPTZ,
  oauth_state VARCHAR(100),
  oauth_state_expires_at TIMESTAMPTZ,
  jd_org_id VARCHAR(50),
  jd_org_name VARCHAR(300),
  -- { "<jdFieldId>": "<agrocloud field uuid>" }
  field_mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
  connected_by UUID REFERENCES users(id) ON DELETE SET NULL,
  connected_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  last_sync_summary JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT john_deere_env_check CHECK (environment IN ('sandbox', 'production'))
);

-- Field operations read from Operations Center (seeding, application, harvest, tillage, carting).
-- A holding table: rows are linked to AgroCloud fields through field_mapping but are not written
-- into AgroCloud's own harvest / application records, which keep their approval workflow.
CREATE TABLE IF NOT EXISTS john_deere_field_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  jd_operation_id VARCHAR(200) NOT NULL,
  jd_org_id VARCHAR(50) NOT NULL,
  jd_field_id VARCHAR(100) NOT NULL,
  jd_field_name VARCHAR(300),
  field_id UUID REFERENCES fields(id) ON DELETE SET NULL,
  operation_type VARCHAR(30) NOT NULL,
  crop_season VARCHAR(10),
  crop_name VARCHAR(100),
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  modified_time TIMESTAMPTZ,
  -- Totals from the operation's measurement types (value + unit), e.g.
  -- { "area": {"value": 12.4, "unitId": "ha"}, "yield": {...}, "averageYield": {...}, "averageMoisture": {...},
  --   "totalMaterial": {...}, "averageMaterial": {...} }
  measurements JSONB NOT NULL DEFAULT '{}'::jsonb,
  products JSONB,
  varieties JSONB,
  raw JSONB,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_jd_operation UNIQUE (organization_id, jd_operation_id)
);

CREATE INDEX IF NOT EXISTS idx_jd_ops_org_type ON john_deere_field_operations (organization_id, operation_type, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_jd_ops_field ON john_deere_field_operations (field_id);
