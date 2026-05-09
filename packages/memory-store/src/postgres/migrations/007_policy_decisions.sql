CREATE TABLE IF NOT EXISTS policy_decisions (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  correlation_id TEXT,
  decision_type TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  allowed BOOLEAN NOT NULL,
  reason TEXT,
  policy_version TEXT,
  ruleset TEXT,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  trace_refs TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS policy_decisions_tenant_created_idx
  ON policy_decisions (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS policy_decisions_resource_idx
  ON policy_decisions (tenant_id, resource_type, resource_id);
