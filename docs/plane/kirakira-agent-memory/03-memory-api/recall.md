# API specification — `recall`

`recall` executes **multi-route retrieval** (similarity, graph, temporal, state), **fuses** results, **reranks** for coverage & non-redundancy, then **compiles** token-budgeted context into a **`MemoryBundle`** (L0–L3 context filesystem layout).

See [`README.md`](README.md).

---

## `RecallRequest`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tenantId` | `string` | yes | Tenant |
| `workspaceId` | `string` | yes | Workspace |
| `actorId` | `string` | no | Principal |
| `query` | `string` | yes | Natural-language or keyword-dense query |
| `allowedNamespaces` | `string[]` | yes | Post-policy namespace allow-list |
| `entityHints` | `string[]` | no | Canonical ids to bias planner |
| `timeIntent` | `TimeIntent` | no | Valid-time / tx-time window or point |
| `runContext` | `RunContext` | no | Enables **state route** |
| `tokenBudget` | `int` | yes | Total token budget for **compiled** text |
| `level` | `0 \| 1 \| 2 \| 3` | yes | Max depth (**L0–L3**) included |
| `routes` | `RouteMask` | no | Enable/disable routes (default: all on) |
| `explain` | `boolean` | no | If true, embed `retrieval_trace` in bundle metadata |
| `cachePolicy` | `object` | no | `bypass`, TTL overrides |

### `TimeIntent`

```ts
type TimeIntent =
  | { kind: "valid"; from?: string; to?: string; anchor?: string }
  | { kind: "transactional"; asOf: string }
  | { kind: "natural"; phrase: string }; // planner parses NL time
```

### `RunContext`

| Field | Description |
|-------|-------------|
| `runId` | Orchestration run |
| `taskId` | Optional task |
| `checkpointId` | Optional explicit checkpoint |
| `mode` | `debug`, `resume`, `live` — influences state route weight |

### `RouteMask`

```ts
interface RouteMask {
  similarity?: boolean; // dense + sparse
  graph?: boolean;
  temporal?: boolean;
  state?: boolean;
}
```

---

## `MemoryBundle`

The bundle is **filesystem-shaped** for progressive loading (OpenViking-style):

```text
/context/recall/{bundle_id}/
  bundle.json
  L0.abstract.md
  L1.overview.md
  L2.cards/*.md
  L3.evidence/*.json
```

### `bundle.json` (schema sketch)

```ts
interface MemoryBundle {
  bundleId: string;
  createdAt: string;
  query: string;
  levels: {
    L0?: { abstract: string; tokens: number };
    L1?: { overviewMarkdown: string; tokens: number };
    L2?: { cards: EvidenceCard[]; tokens: number };
    L3?: { evidence: EvidencePointer[]; tokens: number };
  };
  tokenBudget: number;
  truncated: boolean;
  retrievalTraceId?: string;
}

interface EvidenceCard {
  id: string;
  kind: MemoryKind;
  title: string;
  summary: string;
  provenance: string[]; // memory ids / routes
  routeScores: Record<string, number>;
}

interface EvidencePointer {
  memoryId: string;
  artifactUri?: string;
  graphPathRef?: string;
  segmentRange?: [number, number];
}
```

Transport note: on gRPC, `MemoryBundle` MAY inline `bytes` fields (zstd tar) instead of literal paths.

---

## Token budget behavior

The **budget compiler** walks reranked candidates until `Σ tokens ≤ tokenBudget`:

1. Always materialize **L0** within a micro-budget slice (e.g., 64–128 tokens) if `level ≥ 0`.
2. Fill **L1** next while budget remains.
3. Add **L2 cards** in descending fused score / coverage gain.
4. **L3** pointers are cheap metadata; heavy payload fetch is **lazy** unless `level === 3`.

If truncation occurs, set `truncated=true` and record downgrade reasons in `retrieval_trace`.

---

## Level selection (`level` field)

| `level` | Guarantees |
|---------|------------|
| `0` | L0 abstract + plan summary only |
| `1` | L0 + L1 |
| `2` | Up to L2 cards |
| `3` | Includes L3 evidence pointers **and** allows hydrate of large artifacts (subject to Policy) |

---

## Error conditions

| Code | When |
|------|------|
| `policy.denied` | `memory.read` failure |
| `namespace.empty` | No allowed namespaces post-Policy |
| `planner.failed` | Time parse / entity resolution hard failure |
| `budget.invalid` | Non-positive `tokenBudget` |
| `deps.unavailable` | Upstream vector/graph outage (partial results flag + retry guidance) |

---

## Example

```http
POST /v1/memory/recall
Content-Type: application/json

{
  "tenantId": "acme-corp",
  "workspaceId": "fx-options-desk",
  "actorId": "user_123",
  "query": "What did we know about XYZ revenue before Jan 20?",
  "allowedNamespaces": ["project", "org"],
  "timeIntent": { "kind": "transactional", "asOf": "2025-01-19T23:59:59Z" },
  "tokenBudget": 1800,
  "level": 2,
  "explain": true,
  "runContext": { "runId": "run_456", "mode": "live" }
}
```

```json
{
  "bundleId": "bun_889",
  "createdAt": "2025-05-06T12:34:56Z",
  "query": "What did we know about XYZ revenue before Jan 20?",
  "levels": {
    "L0": {
      "abstract": "Two grounded facts about XYZ FY revenue; confidence medium.",
      "tokens": 96
    },
    "L1": {
      "overviewMarkdown": "# Revenue facts\n- ...",
      "tokens": 420
    },
    "L2": {
      "cards": [
        {
          "id": "fac_001",
          "kind": "fact",
          "title": "XYZ FY2024Q3 revenue",
          "summary": "Reported revenue USD 1.2B",
          "provenance": ["f8c2..."],
          "routeScores": { "similarity": 0.82, "graph": 0.74 }
        }
      ],
      "tokens": 900
    }
  },
  "tokenBudget": 1800,
  "truncated": false,
  "retrievalTraceId": "trc_771"
}
```

Related: [`explain-retrieval.md`](explain-retrieval.md), [`../01-architecture/data-flow.md`](../01-architecture/data-flow.md).
