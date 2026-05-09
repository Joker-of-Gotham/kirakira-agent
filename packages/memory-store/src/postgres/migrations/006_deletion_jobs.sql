CREATE TABLE IF NOT EXISTS deletion_jobs (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  workspace_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  target_kind TEXT NOT NULL,
  target_ids UUID[] NOT NULL DEFAULT ARRAY[]::uuid[],
  reason TEXT,
  requested_by TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS deletion_jobs_tenant_status_idx
  ON deletion_jobs (tenant_id, status, created_at DESC);
