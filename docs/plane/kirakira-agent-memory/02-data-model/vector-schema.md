# Vector schema hybrid collections

Vector stores (Qdrant primary; **pgvector** secondary unified-stack) hold **dense** embeddings, optional **sparse** vectors (BM25/SPLADE), and rich **payloads** for tenant/time/PII filtering.

See [`README.md`](README.md).

---

## Collection per `kind`

Rather than one monolithic collection, partition logically (physical collections or tables) by memory kind to tune HNSW params and sparse models:

| Collection name | Source `MemoryKind` | Notes |
|-----------------|---------------------|-------|
| `mem_episode_dense` | `episode` | Summaries + segment snippets |
| `mem_fact_dense` | `fact` | Canonical text from triples |
| `mem_observation_dense` | `observation` | Consolidated summaries |
| `mem_artifact_dense` | `artifact_meta` | Text surrogates (OCR, captions) |
| `mem_checkpoint_dense` | `checkpoint` | **Short** state digest only—not full `state_json` |
| `mem_belief_dense` | `belief` | Optional; may be excluded in minimal stacks |
| `mem_hybrid` | cross-kind | **Named vectors** `{ dense, sparse }` when using multi-vector |

**Aliases:** Implementations may prefix env/cluster: `prod_eu_mem_fact_dense`.

---

## Named vectors

| Vector name | Index | Purpose |
|-------------|-------|---------|
| `dense` | HNSW (cosine/dot) | Semantic similarity |
| `sparse` | Inverted / sparse-native | Keyword & identifier recall (tickers, ISIN, error codes) |

**Qdrant:** Named vectors on a single point enable **single-request hybrid** search. **pgvector:** use companion FTS/BM25 via Postgres or parallel queries merged in the service.

---

## Payload schema (required fields)

Each point’s payload SHOULD include:

| Field | Type | Description |
|-------|------|-------------|
| `memory_id` | `uuid` | = `MemoryRecord.id` |
| `tenant_id` | `keyword` | Isolation |
| `workspace_id` | `keyword` | |
| `namespace` | `keyword` | `user` / `project` / …; indexed to allow Policy-filter pushdown |
| `kind` | `keyword` | Mirrors `MemoryKind` |
| `entity_ids` | `string[]` | Canonical ids for co-filtering |
| `valid_from` | `datetime` | Valid-time start (nullable) |
| `valid_to` | `datetime` | Valid-time end (nullable) |
| `tx_from` | `datetime` | Transaction-time start |
| `tx_to` | `datetime` | Transaction-time end (nullable) |
| `pii_level` | `keyword` | `none`/`low`/`high`; gates export formatting |
| `tombstoned` | `bool` | True if logically deleted; optional soft-filter |
| `retention_class` | `keyword` | Drives tiering / TTL helpers |

Optional helpful fields: `session_id`, `run_id`, `source_type`, `language`, `embedding_model`.

---

## Payload indexes

Create **keyword/datetime/bool** indexes on:

- `tenant_id`
- `namespace`
- `kind`
- `entity_ids` (array memberships — engine-specific)
- `valid_from`, `valid_to`
- `pii_level`
- `tombstoned`

This aligns with recall routes that **push filters before ANN** to cut Workload.

---

## Point ID conventions

**Idempotent upsert:** `point_id = memory_id` (UUID string) per collection. Re-running embedding jobs **overwrites** the same point.

For multi-vector-per-entity (segment-level), use deterministic suffix:

```text
{memory_id}::seg:{ordinal}
```

---

## Example Qdrant point (JSON)

```json
{
  "id": "f8c2e6b2-7f3a-4c0b-9f2a-6d6a3d0a5b11",
  "vector": {
    "dense": [0.01, -0.04, "..."],
    "sparse": {"indices": [10, 85, 910], "values": [0.6, 0.2, 0.15]}
  },
  "payload": {
    "memory_id": "f8c2e6b2-7f3a-4c0b-9f2a-6d6a3d0a5b11",
    "tenant_id": "acme-corp",
    "workspace_id": "fx-options-desk",
    "namespace": "project",
    "kind": "fact",
    "entity_ids": ["entity:issuer:XYZ"],
    "valid_from": "2025-01-15T10:00:00Z",
    "valid_to": null,
    "tx_from": "2025-01-15T10:05:12Z",
    "tx_to": null,
    "pii_level": "none",
    "tombstoned": false,
    "retention_class": "default"
  }
}
```

---

## Deletion & forget propagation

`forget` MUST:

1. Tombstone Postgres row.
2. Emit outbox event consumed by vector worker.
3. **Delete or mask** points (prefer hard delete + audit log).

If hard delete is delayed, set `payload.tombstoned=true` and exclude in recall filters.

Related: [`../01-architecture/consistency-model.md`](../01-architecture/consistency-model.md), [`graph-schema.md`](graph-schema.md).
