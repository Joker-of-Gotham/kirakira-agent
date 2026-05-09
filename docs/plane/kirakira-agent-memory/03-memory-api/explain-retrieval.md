# API specification — `explainRetrieval`

`explainRetrieval` reconstructs or synthesizes a structured **`RetrievalTrace`** explaining *why* memories were returned—routes taken, candidates considered, fusion weights, budget cuts, and policy filters applied. It powers debugging, compliance reviews, and user-visible provenance.

See [`README.md`](README.md) and [`recall.md`](recall.md).

---

## `ExplainRetrievalRequest`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tenantId` | `string` | yes | Tenant |
| `workspaceId` | `string` | yes | Workspace |
| `actorId` | `string` | no | Requester |
| `traceId` | `string` | no | If known (from `bundle.retrievalTraceId`) |
| `recallEcho` | `RecallRequest` | no | Replay planner with frozen seeds for counterfactual explain |
| `mode` | `enum` | yes | `stored`, `recompute` |
| `detail` | `enum` | no | `standard`, `verbose` |

**Modes**

| Mode | Behavior |
|------|----------|
| `stored` | Load persisted trace from `retrieval_traces` table (fast, immutable snapshot) |
| `recompute` | Run planner + routes with optional **deterministic** settings; may differ if index changed |

**Authorization:** `memory.read` plus **`memory.explain`** if Policy bifurcates highly sensitive tenants.

---

## `RetrievalTrace`

| Field | Type | Description |
|-------|------|-------------|
| `traceId` | `string` | Unique id |
| `createdAt` | `timestamptz` | |
| `recallRequestHash` | `string` | Stable hash of normalized request |
| `policySnapshotId` | `string` | Policy bundle version / hash |
| `plan` | `QueryPlan` | Planner output |
| `routes` | `RouteTrace[]` | Per-route evidence |
| `fusion` | `FusionTrace` | Global merge |
| `budget` | `BudgetTrace` | Token accounting |
| `final` | `FinalSelection` | Ids + scores |

### `QueryPlan`

```ts
interface QueryPlan {
  normalizedQuery: string;
  entities: EntityHit[];
  namespacesAllowed: string[];
  timeInterpretation?: TimeIntent;
  notes?: string[];
}
```

### `RouteTrace`

```ts
interface RouteTrace {
  name: "similarity" | "graph" | "temporal" | "state";
  candidates: RankedCandidate[];
  filtersApplied: string[];
  timingsMs: number;
}
```

### `FusionTrace`

```ts
interface FusionTrace {
  weights: Record<string, number>;
  features: Array<{
    memoryId: string;
    rrf: number;
    coverageGain: number;
    redundancyPenalty: number;
    stateAffinity?: number;
  }>;
}
```

### `BudgetTrace`

```ts
interface BudgetTrace {
  tokenBudget: number;
  perLevel: Record<"L0" | "L1" | "L2+3", { allocated: number; dropped: string[] }>;
  truncationReasons: string[];
}
```

### `FinalSelection`

```ts
interface FinalSelection {
  memoryIds: string[];
  scores: Record<string, number>;
  graphPaths?: string[]; // serialized Cypher paths or edge ids
}
```

---

## Persistence

`recall` with `explain=true` SHOULD persist `RetrievalTrace` **as-of** completion for **stored** mode. Traces may be **PII-scrubbed** per `pii_level` before storage.

Retention class for traces defaults to **`regulated`** in financial deployments; tie into SIEM forwarding instead of long-term hot storage when possible.

---

## Error conditions

| Code | When |
|------|------|
| `not_found` | Unknown `traceId` |
| `policy.denied` | Missing explain permission |
| `non_deterministic` | `recompute` without frozen model versions |
| `stale_index` | Warning only: included in response metadata |

---

## Example

```http
POST /v1/memory/explain_retrieval
Content-Type: application/json

{
  "tenantId": "acme-corp",
  "workspaceId": "fx-options-desk",
  "traceId": "trc_771",
  "mode": "stored",
  "detail": "verbose"
}
```

```json
{
  "traceId": "trc_771",
  "createdAt": "2025-05-06T12:34:57Z",
  "recallRequestHash": "sha256:...",
  "policySnapshotId": "opa_bundle_20250505.3",
  "plan": {
    "normalizedQuery": "xyz revenue before 2025-01-20",
    "entities": [{ "id": "entity:issuer:XYZ", "score": 0.94 }],
    "namespacesAllowed": ["project", "org"],
    "timeInterpretation": { "kind": "transactional", "asOf": "2025-01-19T23:59:59Z" }
  },
  "routes": [
    {
      "name": "similarity",
      "candidates": [{ "id": "fac_001", "rank": 1, "dense": 0.88, "sparse": 0.74 }],
      "filtersApplied": ["tenant_id", "namespace", "tombstoned=false"],
      "timingsMs": 42
    }
  ],
  "fusion": {
    "weights": { "similarity": 0.35, "graph": 0.3, "temporal": 0.2, "state": 0.15 },
    "features": []
  },
  "budget": {
    "tokenBudget": 1800,
    "perLevel": {
      "L0": { "allocated": 96, "dropped": [] },
      "L1": { "allocated": 420, "dropped": [] },
      "L2+3": { "allocated": 900, "dropped": [] }
    },
    "truncationReasons": []
  },
  "final": {
    "memoryIds": ["fac_001", "obs_014"],
    "scores": { "fac_001": 0.91, "obs_014": 0.86 },
    "graphPaths": ["(e:Entity)-[:MENTIONS]-(ep:Episode)-[:CONTAINS]->(f:Fact)"]
  }
}
```

Related: [`../01-architecture/data-flow.md`](../01-architecture/data-flow.md).
