CREATE TABLE IF NOT EXISTS retrieval_traces (
  trace_id UUID PRIMARY KEY,
  query_id TEXT NOT NULL,
  normalized_query TEXT NOT NULL,
  route_plan JSONB NOT NULL,
  routes JSONB NOT NULL,
  fusion_scores JSONB NOT NULL,
  budget_level TEXT NOT NULL,
  total_duration_ms INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS retrieval_traces_created_idx
  ON retrieval_traces (created_at DESC);

CREATE INDEX IF NOT EXISTS retrieval_traces_query_id_idx
  ON retrieval_traces (query_id);
