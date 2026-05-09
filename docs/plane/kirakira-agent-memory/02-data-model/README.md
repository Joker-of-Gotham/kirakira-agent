# Data model — Overview

The Memory Layer models **long-horizon knowledge** and **execution state** with a **unified header** (`MemoryRecord`) plus kind-specific payloads, **bi-temporal** fields, and strict **evidence vs. inference** separation.

Parent overview: [`../README.md`](../README.md) · Source design note: [`../../kirakira-agent-memory.md`](../../kirakira-agent-memory.md).

---

## Core objects

| Object | Purpose |
|--------|---------|
| **`MemoryRecord`** | Canonical header row for every persisted memory item (`kind`, namespaces, temporal fields, PII, tombstone). |
| **`Episode`** | Coherent span of interaction or ingestion; body in blob store; segmentation metadata. |
| **`Fact`** | Structured or normalized **evidence** statement (typically SPO triple) bound to an episode. |
| **`Belief`** | **Inference** with confidence and explicit `supportedBy` / `refutedBy` evidence chains. |
| **`Observation`** | Consolidated **summary** grounded in facts; bridges high-signal retrieval and token-efficient context. |
| **`Preference`** | Stable user/project/org preference (tooling, tone, routing) with governance metadata. |
| **`Checkpoint`** | Durable run/task step boundary for **restore** (LangGraph-style). |
| **`ArtifactMeta`** | Content-addressed blob metadata (`sha256`, `mediaType`, size, WORM flags). |

Detailed headers: [`memory-record.md`](memory-record.md) · Episodes: [`episode.md`](episode.md) · Evidence ladder: [`fact-belief-observation.md`](fact-belief-observation.md).

---

## Bi-temporal fields

Every evolving memory item uses two timelines:

| Axis | Fields | Meaning |
|------|--------|---------|
| **Valid time** (event time) | `valid_from`, `valid_to` | When the proposition held **in the world** (e.g., “USD policy rate was X”). |
| **Transaction time** (system time) | `tx_from`, `tx_to` | When the memory system **knew** or **superseded** the row (ingestion, correction, redaction). |

**Recall planners** must distinguish user questions like:

- “What was true **as of** 2024-03-01?” → filter primarily on **valid time**.
- “What did we **know internally** before the leak patch landed?” → filter primarily on **transaction time**.

Graph edges mirror the same distinction via `valid_at` / `invalid_at` and `created_at` / `expired_at` (see [`graph-schema.md`](graph-schema.md)).

---

## Evidence / inference separation

```mermaid
flowchart LR
  EP[Episode\nraw span / blob]
  F[Fact\nevidence SPO]
  O[Observation\nconsolidated summary]
  B[Belief\ninference + confidence]

  EP --> F
  F --> O
  F --> B
  O --> B
```

- **Facts** are **verifiable** against episodes and artifacts; ideal for **legal** and **audit** reconstruction.
- **Observations** compress many facts into **operational** memory for agents.
- **Beliefs** carry **uncertainty** and **argument structure**; safe updates require **support/refute** metadata, not silent overwrites.

---

## Namespaces

`MemoryRecord.namespace` scopes visibility and retention policy:

| Value | Typical use |
|-------|-------------|
| `user` | Private end-user memory; strictest export/forget semantics. |
| `project` | Shared within a workspace project or initiative. |
| `org` | Tenant-wide norms, approved playbooks. |
| `agent` | Agent-template or tool personas (non-user-specific). |
| `shared` | Curated public-facing bundles; policy-gated writes. |

**Policy** intersects RBAC/ABAC with namespace to produce `RecallRequest` **allowedNamespaces** and write gates.

---

## Schema documentation index

| Document | Contents |
|----------|----------|
| [`memory-record.md`](memory-record.md) | Field-by-field `MemoryRecord` |
| [`episode.md`](episode.md) | `Episode`, `EpisodeSegment` |
| [`fact-belief-observation.md`](fact-belief-observation.md) | Evidence ladder patterns |
| [`graph-schema.md`](graph-schema.md) | Node labels, edge types, temporal Cypher |
| [`vector-schema.md`](vector-schema.md) | Collections, named vectors, payload indexes |
