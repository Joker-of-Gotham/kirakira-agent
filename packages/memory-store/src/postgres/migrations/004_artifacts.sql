CREATE TABLE IF NOT EXISTS artifact_meta (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  uri TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  media_type TEXT NOT NULL,
  bytes BIGINT NOT NULL,
  worm BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS artifact_meta_sha256_idx
  ON artifact_meta (sha256);

CREATE INDEX IF NOT EXISTS artifact_meta_tenant_created_idx
  ON artifact_meta (tenant_id, created_at DESC);
