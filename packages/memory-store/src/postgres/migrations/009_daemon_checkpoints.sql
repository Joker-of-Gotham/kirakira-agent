CREATE TABLE IF NOT EXISTS daemon_checkpoints (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  envelope JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS daemon_checkpoints_run_created_idx
  ON daemon_checkpoints (run_id, created_at DESC);
