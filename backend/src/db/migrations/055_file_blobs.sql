-- Migration 055: Postgres-backed file storage.
--
-- The local-disk storage adapter loses files on every Railway redeploy,
-- and the operator does not want to configure S3/R2 for this prototype.
-- To keep scouting-report photos durable without new infra, we store the
-- binary content directly in Postgres. A separate table keeps the large
-- bytes out of the attachments metadata rows so queries that only need
-- the metadata stay fast.
--
-- At prototype scale (< 1000 photos averaging a few hundred KB each)
-- this is well within Postgres's comfort zone. If the app ever grows
-- past that, switching STORAGE_PROVIDER back to s3/r2 is a no-code
-- config change.
--
-- Safe to re-apply.

CREATE TABLE IF NOT EXISTS file_blobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content BYTEA NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size_bytes INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_file_blobs_created_at ON file_blobs(created_at DESC);
