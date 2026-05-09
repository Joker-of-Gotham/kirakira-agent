# API specification — `checkpoint` & `restore`

LangGraph-aligned **durable execution** support. `checkpoint` persists run/task state; `restore` reloads it after crashes, retries, or deliberate replays.

See [`README.md`](README.md).

---

## `CheckpointRequest`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tenantId` | `string` | yes | Tenant |
| `workspaceId` | `string` | yes | Workspace |
| `actorId` | `string` | no | Initiator |
| `runId` | `uuid` | yes | Orchestration run / thread id |
| `taskId` | `uuid` | no | Sub-task id |
| `step` | `int` | yes | Monotonic step counter per run |
| `stateJson` | `object` | yes | Serializable runtime state (JSON/MessagePack at rest) |
| `artifactManifest` | `ArtifactManifest` | no | Pointers to large blobs |
| `parentCheckpointId` | `uuid` | no | Forms DAG of checkpoints |
| `reason` | `string` | no | `periodic`, `pre_approval`, `crash_debug` |
| `clientMutationId` | `string` | no | Idempotency key per `(runId,step)` |

### `ArtifactManifest`

```ts
interface ArtifactManifest {
  artifacts: ArtifactPointer[];
  notes?: string;
}
```

`ArtifactPointer` matches [`retain.md`](retain.md).

---

## `CheckpointRef`

| Field | Type | Description |
|-------|------|-------------|
| `checkpointId` | `uuid` | Primary id |
| `runId` | `uuid` | |
| `step` | `int` | Committed step |
| `createdAt` | `timestamptz` | |
| `storage` | `enum` | `postgres_inline`, `blob_offloaded` |
| `manifestUri` | `uri` | Present if large state moved to object store |

**Behavior (`checkpoint`):**

1. Authorize **memory.write** + **`checkpoint.write`** obligation if policies split permissions.
2. If payload > inline threshold, write **`stateJson`** to blob; store pointer + digest in Postgres.
3. Transactionally insert `checkpoints` row + update **`memory_records`** header (`kind=checkpoint`) + **outbox** (`CheckpointSaved`).
4. Optionally publish hot key `hot:checkpoint:{run_id}` in Redis for fast resume probes.

---

## `restore`

### Request shapes

**Option A — ref explicit**

```http
POST /v1/memory/restore
Content-Type: application/json

{
  "tenantId": "acme-corp",
  "workspaceId": "fx-options-desk",
  "actorId": "user_123",
  "checkpointRef": {
    "checkpointId": "ckpt_501",
    "runId": "run_456",
    "step": 37
  }
}
```

**Option B — latest for run**

```json
{
  "tenantId": "acme-corp",
  "workspaceId": "fx-options-desk",
  "runId": "run_456",
  "mode": "latest"
}
```

### Authorization

- `checkpoint.restore` MUST be checked when rehydrating **user-private** namespaces or **regulated** artifacts.

### `RestoredState`

| Field | Type | Description |
|-------|------|-------------|
| `checkpointRef` | `CheckpointRef` | Concrete restored pointer |
| `stateJson` | `object` | Hydrated state |
| `artifactManifest` | `ArtifactManifest` | Optional |
| `warnings` | `string[]` | e.g., missing non-critical artifacts |
| `provenance` | `object` | Digests, blob URIs, verification status |

**Behavior (`restore`):**

1. Resolve checkpoint row in Postgres; verify `tenantId` / `workspaceId`.
2. If offloaded, fetch bytes from `manifestUri` / checkpoint blob with streaming + checksum verify.
3. Hydrate artifact pointers **as metadata**; **do not** auto-download huge binaries unless requested.
4. Emit audit record with **`checkpoint.restore`** action.

---

## Error conditions

| Code | When |
|------|------|
| `policy.denied` | Missing `checkpoint.restore` |
| `not_found` | Unknown `checkpointId` / empty run history |
| `tenant_mismatch` | Cross-tenant attempt |
| `integrity.failed` | Digest mismatch on blob |
| `parent.outdated` | Optimistic concurrency / fork detection policy |

---

## Example — checkpoint response

```json
{
  "checkpointId": "ckpt_501",
  "runId": "run_456",
  "step": 37,
  "createdAt": "2025-05-06T10:00:11Z",
  "storage": "blob_offloaded",
  "manifestUri": "s3://kirakira-agent/tenants/acme/runs/run_456/checkpoints/37.msgpack.zst"
}
```

Related: [`../02-data-model/README.md`](../02-data-model/README.md), [`../01-architecture/data-flow.md`](../01-architecture/data-flow.md).
