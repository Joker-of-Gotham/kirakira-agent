CREATE TABLE IF NOT EXISTS checkpoints (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  run_id UUID NOT NULL,
  task_id UUID,
  step_no INT NOT NULL,
  state_json JSONB NOT NULL,
  artifact_manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
  parent_checkpoint_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS checkpoints_run_step_idx
  ON checkpoints (run_id, step_no DESC);

CREATE INDEX IF NOT EXISTS checkpoints_run_created_idx
  ON checkpoints (run_id, created_at DESC);
