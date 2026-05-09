CREATE TABLE IF NOT EXISTS episodes (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  session_id TEXT,
  source_type TEXT NOT NULL,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  body_blob_uri TEXT,
  segmentation_score REAL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS episodes_tenant_workspace_created_at_idx
  ON episodes (tenant_id, workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS episode_segments (
  id UUID PRIMARY KEY,
  episode_id UUID NOT NULL REFERENCES episodes (id) ON DELETE CASCADE,
  offset_start INT NOT NULL,
  offset_end INT NOT NULL,
  text TEXT NOT NULL,
  entity_refs UUID[] NOT NULL DEFAULT ARRAY[]::uuid[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS episode_segments_episode_id_idx
  ON episode_segments (episode_id);
