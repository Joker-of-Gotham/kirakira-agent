# `MemoryRecord` — Field reference

`MemoryRecord` is the **unified header** for all kinds of durable memory. Implementations may store type-specific columns or JSONB payloads, but **every** persisted item MUST be addressable through this header for policy, recall filtering, deletion, and audit.

See [`README.md`](README.md) for model overview.

---

## Identity & scoping

| Field | Type | Required | Description | Constraints |
|-------|------|----------|-------------|-------------|
| `id` | `uuid` | yes | Primary key shared across Postgres, vector point id, graph vertex id | Globally unique; immutable |
| `tenantId` | `string` | yes | Top-level isolation boundary | Max length per platform (recommend ≤ 128) |
| `workspaceId` | `string` | yes | Workspace / workspace-like partition | |
| `actorId` | `string` | no | User / service principal that caused the write | Omit for system jobs |
| `namespace` | `enum` | yes | Access scope: `user`, `project`, `org`, `agent`, `shared` | Must align with Policy decisions |

**Example (JSON):**

```json
{
  "id": "f8c2e6b2-7f3a-4c0b-9f2a-6d6a3d0a5b11",
  "tenantId": "acme-corp",
  "workspaceId": "fx-options-desk",
  "actorId": "user_01HZZZZZZZZZZZZZZZZZZZZZZ",
  "namespace": "project"
}
```

---

## Kind & content

| Field | Type | Required | Description | Constraints |
|-------|------|----------|-------------|-------------|
| `kind` | `MemoryKind` | yes | Discriminator for payload interpretation | One of: `episode`, `fact`, `belief`, `observation`, `preference`, `checkpoint`, `artifact_meta` |
| `text` | `string` | no | Canonical textual form used for embedding & display | May be redacted in recall responses |
| `summaryL0` | `string` | no | Ultra-compact abstract (L0 layer) | Target ≤ 1–2 sentences |
| `overviewL1` | `string` | no | Structured-ish overview (L1 layer) | Markdown or structured text |
| `metadata` | `object` | yes | Extensible JSON bag for tool IDs, source URLs, policy refs | MUST NOT embed secrets post-classification |

`MemoryKind` (TypeScript-style):

```ts
type MemoryKind =
  | "episode"
  | "fact"
  | "belief"
  | "observation"
  | "preference"
  | "checkpoint"
  | "artifact_meta";
```

---

## Inference linkage & entities

| Field | Type | Required | Description | Constraints |
|-------|------|----------|-------------|-------------|
| `confidence` | `float` | no | Primary confidence for `belief` / `observation` | Range `0.0..1.0`; calibration policy-defined |
| `evidenceIds` | `uuid[]` | yes | Facts / episodes / artifacts that **support** this item | Empty for pure evidence kinds (`episode`, raw `fact` without upward inference) |
| `entityIds` | `uuid[]` | yes | Canonical entities touched | Canonical entity graph must exist or be lazy-created |

**`evidenceIds` rules of thumb**

- **`fact`:** usually empty or self-referential; instead reference upstream `episode` id in typed `Fact.sourceEpisodeId` (see [`fact-belief-observation.md`](fact-belief-observation.md)).
- **`observation` / `belief`:** MUST point to grounding facts or episodes unless explicitly marked **hypothesis** in `metadata`.

---

## Bi-temporal columns

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `validFrom` | `timestamptz` | no | Valid-time start |
| `validTo` | `timestamptz` | no | Valid-time end (open-ended if null) |
| `txFrom` | `timestamptz` | yes | Transaction-time start (**system** observation begins) |
| `txTo` | `timestamptz` | no | Transaction-time end (row **closed** / superseded) |

**Constraints:**

- If `txTo` is non-null, the row is **historical**; current projections must filter `tx_to IS NULL` or a dedicated **current** view.
- If `validTo` < `validFrom`, reject at ingest validation.

---

## Governance & privacy

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `retentionClass` | `enum` | yes | `default`, `regulated`, `ephemeral` — drives lifecycle jobs |
| `piiLevel` | `enum` | yes | `none`, `low`, `high` — gates recall formatting & export |
| `redacted` | `boolean` | yes | If true, `text` / summaries may be elided externally but audit retains mapping |
| `tombstonedAt` | `timestamptz` | no | Set by `forget`; row remains for audit, excluded from recall |

**Example (privacy + time):**

```json
{
  "retentionClass": "default",
  "piiLevel": "high",
  "redacted": true,
  "tombstonedAt": null,
  "validFrom": "2025-01-15T10:00:00Z",
  "validTo": null,
  "txFrom": "2025-01-15T10:05:12Z",
  "txTo": null
}
```

---

## SQL mapping (illustrative)

```sql
CREATE TABLE memory_records (
  id                UUID PRIMARY KEY,
  tenant_id         TEXT NOT NULL,
  workspace_id      TEXT NOT NULL,
  namespace         TEXT NOT NULL,
  kind              TEXT NOT NULL,
  text              TEXT,
  summary_l0        TEXT,
  overview_l1       TEXT,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence        REAL,
  evidence_ids      UUID[] NOT NULL DEFAULT '{}',
  entity_ids        UUID[] NOT NULL DEFAULT '{}',
  valid_from        TIMESTAMPTZ,
  valid_to          TIMESTAMPTZ,
  tx_from           TIMESTAMPTZ NOT NULL DEFAULT now(),
  tx_to             TIMESTAMPTZ,
  retention_class   TEXT NOT NULL DEFAULT 'default',
  pii_level         TEXT NOT NULL DEFAULT 'none',
  redacted          BOOLEAN NOT NULL DEFAULT false,
  tombstoned_at     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
) PARTITION BY RANGE (created_at);
```

---

## Validation checklist (ingest)

1. `kind` matches payload presence (`artifact_meta` must link to blob URI in `metadata` or child table).
2. Namespace allowed by Policy for `actorId`.
3. `confidence` only when `kind ∈ {belief, observation}` (unless experimental kinds extend spec).
4. Any non-null `tombstonedAt` forces recall exclusion and schedules index deletes.
5. `entityIds` resolved or **stub entities** created transactionally with **outbox** fan-out.

Related: [`vector-schema.md`](vector-schema.md) (payload mirrors these fields), [`graph-schema.md`](graph-schema.md) (node props).
