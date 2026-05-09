# API specification — `retain`

`retain` ingests **memory events** (chat spans, tool output, files, sandbox traces, policy annotations) into the **system of record** and schedules **async materialization** for vectors, graph projection, and secondary blob processing.

See [`README.md`](README.md).

---

## `RetainRequest`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tenantId` | `string` | yes | Tenant |
| `workspaceId` | `string` | yes | Workspace |
| `actorId` | `string` | no | Calling principal |
| `namespace` | `string` | yes | Target namespace (`user`, `project`, …) |
| `clientMutationId` | `string` | no | Retry idempotency key |
| `source` | `RetentionSource` | yes | Typed payload (union) |
| `retentionHints` | `object` | no | Hints: `priority`, `predictCalibrate`, language |
| `policyContext` | `object` | no | OPA/Cedar input augmentation |

### `RetentionSource` (discriminated union)

```ts
type RetentionSource =
  | { type: "episode"; episode: EpisodeDraft }
  | { type: "fact"; fact: FactDraft }
  | { type: "preference"; preference: PreferenceDraft }
  | { type: "artifact"; artifact: ArtifactDraft }
  | { type: "embedding_refresh"; memoryId: string }; // admin
```

**`EpisodeDraft`** (illustrative):

| Field | Type | Required |
|-------|------|----------|
| `sessionId` | `string` | no |
| `sourceType` | `EpisodeSourceType` | yes |
| `startAt`, `endAt` | `timestamptz` | yes |
| `segments` | `EpisodeSegmentDraft[]` | no |
| `rawPayloadRef` | `uri` | no | Pre-uploaded blob |
| `inlineText` | `string` | no | Small transcripts only |

**`FactDraft`:** subject/predicate/object/canonicalText/sourceEpisodeId (see [`../02-data-model/fact-belief-observation.md`](../02-data-model/fact-belief-observation.md)).

**`PreferenceDraft`:**

| Field | Type | Required |
|-------|------|----------|
| `key` | `string` | yes |
| `value` | `unknown` | yes |
| `scope` | `user \| project \| org` | yes |

**`ArtifactDraft`:**

| Field | Type | Required |
|-------|------|----------|
| `uri` | `uri` | yes (pre-uploaded) |
| `mediaType` | `string` | yes |
| `sha256` | `string` | yes |
| `bytes` | `int` | yes |
| `worm` | `boolean` | no |

---

## `RetainReceipt`

| Field | Type | Description |
|-------|------|-------------|
| `memoryId` | `uuid` | Primary id for header row |
| `version` | `int` | Optimistic concurrency / row version |
| `outboxEventIds` | `string[]` | Published event identifiers |
| `materializationStatus` | `enum` | `accepted` (async), rarely `synchronous_complete` in dev |
| `artifactRefs` | `ArtifactPointer[]` | Committed blobs (if any) |

**`ArtifactPointer`:**

```ts
interface ArtifactPointer {
  id: string;
  uri: string;
  sha256: string;
  mediaType: string;
  bytes: number;
}
```

---

## Behavior

1. **Authorize** `memory.write` for `(tenant, workspace, namespace, actor, source.type)`.
2. **Classify** PII/secrets; redact or block per Policy obligations.
3. **Allocate ids** deterministically or UUIDv7 per deployment standard.
4. **Write Postgres** (header + typed tables) + **outbox** in **one transaction**.
5. **Publish** to Redis Stream for materializers.
6. Return `RetainReceipt` **without waiting** for vector/graph completion (unless `hints.forceSync` debug flag).

**Nemori predict–calibrate:** If hints request it, compute **surprise** vs existing memory; low-surprise events may create **episode-only** rows.

---

## Error conditions

| Code | When |
|------|------|
| `policy.denied` | Policy DENY |
| `namespace.invalid` | Non-declared namespace string |
| `validation.failed` | Schema / temporal constraint violations |
| `idempotency.replay` | Same `clientMutationId` → same receipt (HTTP 200) |
| `storage.unavailable` | Postgres outage |
| `quota.exceeded` | Tenant write throttle |
| `artifact.missing` | `rawPayloadRef` not found |

---

## Example (HTTP JSON)

**Request:**

```http
POST /v1/memory/retain
Content-Type: application/json
Idempotency-Key: 01J8XYZ...

{
  "tenantId": "acme-corp",
  "workspaceId": "fx-options-desk",
  "actorId": "user_123",
  "namespace": "project",
  "source": {
    "type": "episode",
    "episode": {
      "sourceType": "tool",
      "startAt": "2025-01-15T10:00:00Z",
      "endAt": "2025-01-15T10:00:04Z",
      "inlineText": "pricing_tool returned bid=101.22 for XYZ",
      "sessionId": "sess_abc"
    }
  }
}
```

**Response:**

```json
{
  "memoryId": "f8c2e6b2-7f3a-4c0b-9f2a-6d6a3d0a5b11",
  "version": 1,
  "outboxEventIds": ["obx_1001", "obx_1002"],
  "materializationStatus": "accepted",
  "artifactRefs": []
}
```

Related: [`../01-architecture/data-flow.md`](../01-architecture/data-flow.md).
