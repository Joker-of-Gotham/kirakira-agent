-- Partitioned memory fact store. PK includes created_at (required for PostgreSQL range partitioning).
CREATE TABLE IF NOT EXISTS memory_records (
  id UUID NOT NULL,
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  namespace TEXT NOT NULL,
  kind TEXT NOT NULL,
  text TEXT,
  summary_l0 TEXT,
  overview_l1 TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence REAL,
  evidence_ids UUID[] NOT NULL DEFAULT ARRAY[]::uuid[],
  entity_ids UUID[] NOT NULL DEFAULT ARRAY[]::uuid[],
  valid_from TIMESTAMPTZ,
  valid_to TIMESTAMPTZ,
  tx_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  tx_to TIMESTAMPTZ,
  retention_class TEXT NOT NULL DEFAULT 'default',
  pii_level TEXT NOT NULL DEFAULT 'none',
  redacted BOOLEAN NOT NULL DEFAULT false,
  tombstoned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX IF NOT EXISTS memory_records_tenant_kind_created_at_idx
  ON memory_records (tenant_id, kind, created_at DESC);

CREATE INDEX IF NOT EXISTS memory_records_metadata_gin
  ON memory_records USING GIN (metadata);

CREATE TABLE IF NOT EXISTS memory_records_default PARTITION OF memory_records DEFAULT;
