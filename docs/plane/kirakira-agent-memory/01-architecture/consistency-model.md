# Consistency model — Outbox, recovery, idempotency

The Memory Layer targets **strong durability and transactional integrity** at the system-of-record, with **eventual consistency** for expensive derived indexes (vector, graph, secondary blob processing). This document specifies the **transactional outbox**, failure handling, disaster recovery expectations, and **idempotency** guarantees.

See [`README.md`](README.md) for architecture context.

---

## Transactional outbox pattern

**Invariant:** Any state change that must be reflected in external indexes MUST either:

1. Be persisted in **Postgres** (authoritative), and
2. Emit a corresponding **outbox event** in the **same transaction**.

Workers **do not** “fire-and-forget” side effects from the synchronous `MemoryService` request path except by enqueueing via this pattern.

**Benefits:**

- No **orphan vectors** or **orphan edges** that lack a backing `memory_records` row after a crash.
- Replayable history: **re-materialize** Qdrant/Neo4j/S3-derived views from Postgres + outbox.
- Clear failure domain: API acknowledges after **durable commit**, not after every index is warm.

**Typical outbox event types** (illustrative):

- `MemoryRecordUpserted`
- `EpisodeBlobCommitted`
- `ForgetPropagated`
- `CheckpointSaved`
- `ReflectBatchApplied`

---

## Eventual consistency to materializers

**Order of visibility:**

1. Caller receives `RetainReceipt` / `CheckpointRef` after Postgres commit.
2. Outbox row moves to `pending` → worker leases → `processing` → `done` (or retry).
3. Vector/graph stores converge within seconds under normal load; **longer** under backlog or provider degradation.

**Read-your-writes (recall):**

- **Default:** `recall` may union **Postgres fallback** (metadata + keyword) with vector/graph hits so freshly retained content is visible even before all materializers complete.
- **Strict index-only** recall modes (if ever offered) MUST document stale-read windows.

---

## Failure handling

### Outbox retry with exponential backoff

| Field / behavior | Purpose |
|------------------|---------|
| `attempts` | Monotonic counter per outbox row |
| `available_at` | Not-before timestamp for next try |
| Backoff | e.g., `min(cap, base * 2^attempts)` jittered |
| **Poison messages** | After `N` failures, move to **dead-letter** table/topic with last error, alert SRE |

**Poison / DLQ handling:**

- Human or automated triage decides: **fix worker**, **patch payload**, **skip with compensating transaction**, or **replay** after code fix.
- DLQ rows retain `tenant_id`, `aggregate_id`, `event_type`, and full payload for audit.

### Reconciliation jobs

Scheduled **reconciliation** compares:

- Postgres **`memory_records`** vs vector **point IDs** / graph **node IDs**
- Tombstone / `forget` jobs vs index presence

Discrepancies emit **corrective outbox events** or **direct idempotent deletes** from an admin worker with break-glass policy.

---

## Recovery and durability (by store)

| Store | Recommended approach |
|-------|---------------------|
| **Postgres** | WAL archiving + **PITR**; regular logical backups for cross-region; test restores quarterly. |
| **Qdrant** | Snapshot schedule + replication; rebuild from outbox replay if snapshots are stale or corrupt. |
| **Neo4j** | Online backup / enterprise backup; causal cluster for HA; validate restore Runbook. |
| **Kuzu** | File-level backup of embedded DB; suitable for single-tenant / dev; plan migration path for HA. |
| **Redis** | AOF + RDB; **Streams are not SoR**—treat loss as lag, not truth loss; workers rebuild from outbox. |
| **S3 / MinIO** | Versioning; Object Lock only for **audit / regulatory** buckets—not all personal data. |

**Redis loss scenario:** If Streams are lost but Postgres + outbox remain, workers **scan outbox** for `pending` / stuck `processing` rows and republish—design outbox leases with timeouts to avoid permanent locks.

---

## Idempotency guarantees

| Operation | Idempotency mechanism |
|-----------|------------------------|
| **Outbox consumption** | Unique `(aggregate_type, aggregate_id, event_type, payload_hash)` or **outbox id** dedupe; workers write **processed markers** in Postgres. |
| **Vector upsert** | Upsert by deterministic point id = `memory_record.id` (+ collection + vector name); **same id → same vector**. |
| **Graph merge** | `MERGE` on natural keys (`tenant_id`, domain id); property updates monotonic except controlled **temporal closes**. |
| **Blob write** | Content-addressed storage (`sha256`) with versioned keys; retries do not duplicate logical bytes. |
| **retain retry from client** | Clients SHOULD send **`Idempotency-Key`** (HTTP) or `clientMutationId`; server returns same `RetainReceipt` when replayed. |

**Not idempotent without care:** blind `INSERT` graph edges without `MERGE`, or vector **append** APIs that mint new ids per try—**avoid** in worker paths.

---

## Summary

- **Postgres commit + outbox** is the **single consistency anchor** for writes.
- **Materializers** are **eventually consistent** but **deterministic** and **idempotent** when keyed correctly.
- **Recovery** = restore Postgres first, then **replay / reconcile** indexes; Redis is **coordination**, not truth.

Related: [`data-flow.md`](data-flow.md), [`../02-data-model/README.md`](../02-data-model/README.md).
