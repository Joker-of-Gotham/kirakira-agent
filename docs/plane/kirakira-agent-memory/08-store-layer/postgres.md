# Postgres — system of record

Implementation reference: `packages/memory-store` (`src/postgres/`).

---

## Role

Postgres stores **durable, queryable truth** for the memory plane: typed rows, audit metadata, jobs, and outbox events. Vector stores and graph databases are populated **asynchronously** from this source.

---

## Table design

The following tables are created by versioned migrations under `packages/memory-store/src/postgres/migrations/`.

### `memory_records` (partitioned)

Partitioned fact store. The primary key includes `created_at` because PostgreSQL range partitioning requires the partition key to appear in the primary key.

| Column | Purpose |
|--------|---------|
| `id`, `created_at` | Composite primary key |
| `tenant_id`, `workspace_id`, `namespace` | Multi-tenant scoping |
| `kind` | Record kind (episode, fact, belief, …) |
| `text`, `summary_l0`, `overview_l1` | Text tiers for recall |
| `metadata` | JSONB sidecar |
| `confidence` | Optional confidence for inferential kinds |
| `evidence_ids`, `entity_ids` | UUID arrays for provenance / linking |
| `valid_from`, `valid_to` | **Valid time** (when the fact held in the world) |
| `tx_from`, `tx_to` | **Transaction time** (when the system knew it) |
| `retention_class`, `pii_level`, `redacted` | Lifecycle and privacy |
| `tombstoned_at` | Soft delete / forget marker |

Related child data (e.g. episode segments) lives in normalized tables where needed.

### `episodes` and `episode_segments`

`episodes` captures session-level metadata and optional `body_blob_uri` for large bodies in object storage. `episode_segments` stores spans with offsets and `entity_refs`.

### `checkpoints`

Agent run state: `run_id`, `step_no`, `state_json`, `artifact_manifest`, optional `parent_checkpoint_id` for lineage.

### `artifact_meta`

Registry of blob objects: `uri`, `sha256`, `media_type`, `bytes`, `worm` flag, `metadata` JSONB.

### `outbox`

Transactional outbox for downstream fan-out; see [`outbox.md`](outbox.md).

### `deletion_jobs`

Async deletion / forget propagation: `target_kind`, `target_ids`, status lifecycle, error fields.

### `policy_decisions`

Audit of policy evaluations: `decision_type`, `resource_type` / `resource_id`, `allowed`, `context`, `trace_refs`.

### `retrieval_traces`

Structured traces for `explainRetrieval` and debugging: `query_id`, `route_plan`, `routes`, `fusion_scores`, timing.

---

## Partitioning strategy

`memory_records` uses **`PARTITION BY RANGE (created_at)`** with **monthly** partitions in UTC.

- A **DEFAULT** partition catches rows if a month partition is missing (migrations create `memory_records_default`).
- Runtime code (`ensurePartitions` in `partition-manager.ts`) creates child partitions named `{table}_{YYYY}_{MM}` with bounds `[first_day_of_month, first_day_of_next_month)` using **date** literals for `FROM` / `TO`.

Operational checklist:

- Run partition ensuring on a schedule (e.g. monthly + horizon) so inserts never hit the default partition in steady state.
- Retention policies may **detach** or **drop** old partitions after legal and product review.

---

## Index strategy

### B-tree indexes

Well suited for equality and range filters on hot paths:

- `memory_records`: `(tenant_id, kind, created_at DESC)`
- `episodes`: `(tenant_id, workspace_id, created_at DESC)`
- `checkpoints`: `(run_id, step_no DESC)`, `(run_id, created_at DESC)`
- `artifact_meta`: `(sha256)`, `(tenant_id, created_at DESC)`
- `outbox`: `(status, available_at)` for processor polling
- `deletion_jobs`: `(tenant_id, status, created_at DESC)`
- `policy_decisions`: `(tenant_id, created_at DESC)`, `(tenant_id, resource_type, resource_id)`
- `retrieval_traces`: `(created_at DESC)`, `(query_id)`

### GIN on JSONB

- `memory_records.metadata` uses **GIN** for containment / path queries.

Optional tightening (if workloads are path-heavy): `USING GIN (metadata jsonb_path_ops)` with matching `@>` query patterns-only may reduce index size at the cost of operator support.

---

## Bi-temporal query patterns

**Valid time** — *when the proposition was true in the domain.*

**Transaction time** — *when the system recorded or corrected the proposition.*

Common patterns (illustrative):

```sql
-- As-of valid time (business-time slice)
SELECT id, kind, text, valid_from, valid_to
FROM memory_records
WHERE tenant_id = $1
  AND tombstoned_at IS NULL
  AND valid_from <= $as_of
  AND (valid_to IS NULL OR valid_to > $as_of);

-- As-of transaction time (audit / PITR for corrections)
SELECT id, kind, text, tx_from, tx_to
FROM memory_records
WHERE tenant_id = $1
  AND tombstoned_at IS NULL
  AND tx_from <= $observed_at
  AND (tx_to IS NULL OR tx_to > $observed_at);
```

Close **valid** or **transaction** intervals with an update that sets the corresponding `*_to` and, when modeling supersession, opens a new row or version with new `*_from`.

---

## Migration management

`packages/memory-store/src/postgres/migrator.ts` implements:

1. **Discovery** — All `*.sql` files in the migrations directory, sorted lexicographically.
2. **`_migrations` table** — `name` (PK), `applied_at`, `sha256`.
3. **Checksum enforcement** — For each file already applied, the on-disk SHA-256 must match the recorded hash or startup fails (**drift detection**).
4. **Transactional apply** — Each migration runs inside a single transaction; on success, a row is inserted into `_migrations`.

**`_migrations` definition (from migrator):**

```sql
CREATE TABLE IF NOT EXISTS _migrations (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sha256 TEXT NOT NULL
);
```

Never rewrite applied migration files; add a new numbered file instead.

---

## Connection pooling with `postgres.js`

`createPgClient` wraps the [`postgres`](https://github.com/porsager/postgres) library:

- `max` connections (default **20**)
- `idle_timeout` derived from `idleTimeoutMs` (default 30 seconds)
- `types.bigint` mapped for BIGINT / bigserial round-trips
- Optional TLS via `ssl`

Use a **small pool per process** and scale horizontally with more app instances rather than huge per-process pools.

Example (TypeScript):

```typescript
import { createPgClient } from "@kirakira/memory-store/postgres/client";

const sql = createPgClient({
  host: process.env.PG_HOST!,
  port: Number(process.env.PG_PORT ?? "5432"),
  database: process.env.PG_DATABASE!,
  username: process.env.PG_USER!,
  password: process.env.PG_PASSWORD!,
  maxConnections: 20,
  idleTimeoutMs: 30_000,
  ssl: process.env.PG_SSL === "true",
});
```

---

## `CREATE TABLE` examples from migrations

The snippets below match `packages/memory-store/src/postgres/migrations/*.sql` (authoritative copy in-repo).

### `001_memory_records.sql`

```sql
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
```

### `002_episodes.sql`

```sql
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
```

### `003_checkpoints.sql`

```sql
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
```

### `004_artifacts.sql`

```sql
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
```

### `005_outbox.sql`

```sql
CREATE TABLE IF NOT EXISTS outbox (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT,
  aggregate_type TEXT,
  aggregate_id UUID,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 10,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS outbox_status_available_idx
  ON outbox (status, available_at);
```

### `006_deletion_jobs.sql`

```sql
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
```

### `007_policy_decisions.sql`

```sql
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
```

### `008_retrieval_traces.sql`

```sql
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
```

---

## Monthly partition DDL (runtime)

Example generated by `ensurePartitions` (UTC month boundaries):

```sql
CREATE TABLE IF NOT EXISTS public.memory_records_2026_05 PARTITION OF public.memory_records
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
```

---

## Related reading

- [`outbox.md`](outbox.md) — outbox semantics and processor
- [`../02-data-model/memory-record.md`](../02-data-model/memory-record.md) — logical record model
