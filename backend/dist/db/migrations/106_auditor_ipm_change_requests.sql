-- Migration 106: Auditor role + IPM change request queue

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN (
    'ceo', 'farm_manager', 'operation_manager', 'agronomist', 'pest_agronomist',
    'worker', 'operator', 'intern_student', 'intern_teacher', 'auditor'
  ));

CREATE TABLE IF NOT EXISTS ipm_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID,
  entity_type VARCHAR(64) NOT NULL DEFAULT 'pesticide_application',
  entity_id UUID NOT NULL,
  action VARCHAR(16) NOT NULL CHECK (action IN ('update', 'delete')),
  requested_by UUID NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  proposed_payload JSONB,
  snapshot_before JSONB NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  reviewer_comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ipm_change_requests_status ON ipm_change_requests(status);
CREATE INDEX IF NOT EXISTS idx_ipm_change_requests_entity ON ipm_change_requests(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_ipm_change_requests_requested_by ON ipm_change_requests(requested_by);
