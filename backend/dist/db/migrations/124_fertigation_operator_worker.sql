-- Optional operator (manpower worker) on fertigation entries
ALTER TABLE fertigation_entries
  ADD COLUMN IF NOT EXISTS worker_id UUID REFERENCES workers(id);

CREATE INDEX IF NOT EXISTS idx_fertigation_entries_worker
  ON fertigation_entries(worker_id);
