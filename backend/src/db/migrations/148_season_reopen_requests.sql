-- Auditor reopen queue for a closed season.
--
-- End season stamps leftover plantings with reason 'Season closed'. Approve
-- undoes only those rows, never a cycle uproot. The next-season stub created
-- at close is discarded only when it still has no plantings.

CREATE TABLE IF NOT EXISTS season_reopen_requests (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id   UUID REFERENCES organizations(id),
    season_id         UUID NOT NULL REFERENCES seasons(id),
    reason            TEXT NOT NULL,
    requested_by      UUID NOT NULL REFERENCES users(id),
    status            VARCHAR(16) NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by       UUID REFERENCES users(id),
    reviewed_at       TIMESTAMPTZ,
    reviewer_comment  TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_season_reopen_one_pending
  ON season_reopen_requests (season_id) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_season_reopen_org_status
  ON season_reopen_requests (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_season_reopen_season
  ON season_reopen_requests (season_id);
