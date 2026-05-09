# API specification — `forget` & `export`

Governance-oriented operations: **`forget`** applies tombstones and propagates deletion to indexes; **`export`** packages subject or workspace data for **portability** and **data subject rights** workflows.

See [`README.md`](README.md).

---

## `forget`

### `ForgetRequest`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tenantId` | `string` | yes | Tenant |
| `workspaceId` | `string` | yes | Workspace |
| `actorId` | `string` | no | Initiator |
| `subject` | `ForgetSubject` | yes | What to delete |
| `mode` | `enum` | yes | `soft`, `hard` |
| `reason` | `string` | yes | Audit justification (`gdpr_erasure`, `user_request`, …) |
| `dryRun` | `boolean` | no | Enumerate impact |
| `clientMutationId` | `string` | no | Idempotency |

### `ForgetSubject` (union)

```ts
type ForgetSubject =
  | { kind: "memory_ids"; ids: string[] }
  | { kind: "namespace"; namespace: string; filter?: MetadataFilter }
  | { kind: "artifact"; artifactId: string }
  | { kind: "user_subject"; userId: string }; // maps to namespaces + artifacts
```

### `ForgetReceipt`

| Field | Type | Description |
|-------|------|-------------|
| `jobId` | `string` | Async propagation tracker |
| `tombstonedIds` | `uuid[]` | Rows marked deleted |
| `scheduledIndexPurge` | `boolean` | Outbox emitted |
| `blockedItems` | `BlockedItem[]` | Legal hold / WORM prevented delete |
| `dryRunReport` | `object` | Counts |

```ts
interface BlockedItem {
  id: string;
  reason: "legal_hold" | "worm_bucket" | "regulated_retention";
  detail?: string;
}
```

### Behavior

1. **Authorize** `memory.forget` with high-friction approvals for broad scopes.
2. **Enumerate targets** in Postgres (records, artifacts, checkpoints if in scope).
3. **Apply legal constraints**: Object Lock / hold → **skip physical delete**, record `blockedItems`; consider crypto-shredding plan for encrypted payloads.
4. **Transaction:** set `tombstoned_at`, close `tx_to` if modeling supersession, append **audit** entry.
5. **Outbox:** vector delete / mask, graph invalidation edges, Redis cache purge, blob delete (if allowed).
6. Return **receipt**; heavy propagation continues asynchronously.

### GDPR & compliance notes

- **Controllers** must distinguish **personal data** vs **WORM audit** buckets (see Memory plane overview).
- **Erasure proof** requires linkage from receipt `jobId` to completed worker stages.
- **Processors** SHOULD offer **data residency** flags in export/forget routing.

---

## `export`

### `ExportRequest`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tenantId` | `string` | yes | Tenant |
| `workspaceId` | `string` | yes | Workspace |
| `actorId` | `string` | no | Requester |
| `subject` | `ExportSubject` | yes | Scope |
| `format` | `enum` | yes | `jsonl`, `json`, `parquet` (future) |
| `redaction` | `enum` | yes | `none`, `pii_default`, `full_redact_metadata` |
| `includeArtifacts` | `boolean` | no | Generate signed URLs / tarball |
| `delivery` | `DeliveryTarget` | yes | Where export lands |

```ts
type ExportSubject =
  | { kind: "user"; userId: string }
  | { kind: "namespace"; namespace: string; since?: string; to?: string }
  | { kind: "memory_ids"; ids: string[] };

type DeliveryTarget =
  | { type: "sync_download" }
  | { type: "s3_put"; uri: string }
  | { type: "signed_url"; ttlSeconds: number };
```

### `ExportReceipt`

| Field | Type | Description |
|-------|------|-------------|
| `exportJobId` | `string` | |
| `status` | `enum` | `completed`, `queued` |
| `location` | `uri` | Final object |
| `manifestSha256` | `string` | Integrity reference |
| `recordCount` | `int` | |
| `expiresAt` | `timestamptz` | For signed URLs |

### Behavior

1. **Authorize** export privileges (`memory.read` + **`memory.export`**).
2. **Scan** scoped rows; **apply redaction** rules by `pii_level` and Policy.
3. **Bundle artifacts** (optional) distinct from audit objects.
4. Write manifest + data to **delivery** target; log to audit/SIEM.

### Error conditions (shared)

| Code | When |
|------|------|
| `policy.denied` | Missing permission |
| `scope.too_broad` | Requires elevated approval |
| `legal_hold` | Some items skipped / export partial |
| `delivery.failed` | Storage write error |

---

## Examples

**forget (dry run):**

```http
POST /v1/memory/forget
Content-Type: application/json

{
  "tenantId": "acme-corp",
  "workspaceId": "fx-options-desk",
  "subject": { "kind": "memory_ids", "ids": ["f8c2..."] },
  "mode": "soft",
  "reason": "gdpr_erasure",
  "dryRun": true
}
```

**export:**

```http
POST /v1/memory/export
Content-Type: application/json

{
  "tenantId": "acme-corp",
  "workspaceId": "fx-options-desk",
  "subject": { "kind": "user", "userId": "user_123" },
  "format": "jsonl",
  "redaction": "pii_default",
  "includeArtifacts": false,
  "delivery": { "type": "signed_url", "ttlSeconds": 900 }
}
```

```json
{
  "exportJobId": "exp_2201",
  "status": "completed",
  "location": "https://minio.example/acme/exports/exp_2201.jsonl.zst?sig=...",
  "manifestSha256": "8f3c...",
  "recordCount": 1543,
  "expiresAt": "2025-05-06T12:55:00Z"
}
```

Related: [`../01-architecture/consistency-model.md`](../01-architecture/consistency-model.md).
