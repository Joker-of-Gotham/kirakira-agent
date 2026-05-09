# Memory API — `MemoryService` overview

The **Memory API** is the only supported entry for orchestrators and runtimes to interact with the Memory Layer. Implementations expose it as a language SDK (`MemoryService` interface) backed by RPC/HTTP internally.

Parent overview: [`../README.md`](../README.md).

---

## Interface

```ts
export interface MemoryService {
  retain(req: RetainRequest): Promise<RetainReceipt>;
  recall(req: RecallRequest): Promise<MemoryBundle>;
  reflect(req: ReflectRequest): Promise<ReflectReceipt>;
  checkpoint(req: CheckpointRequest): Promise<CheckpointRef>;
  restore(ref: CheckpointRef): Promise<RestoredState>;
  forget(req: ForgetRequest): Promise<ForgetReceipt>;
  export(req: ExportRequest): Promise<ExportReceipt>;
  explainRetrieval(req: ExplainRetrievalRequest): Promise<RetrievalTrace>;
}
```

```rust
#[async_trait]
pub trait MemoryService: Send + Sync {
    async fn retain(&self, req: RetainRequest) -> Result<RetainReceipt>;
    async fn recall(&self, req: RecallRequest) -> Result<MemoryBundle>;
    async fn reflect(&self, req: ReflectRequest) -> Result<ReflectReceipt>;
    async fn checkpoint(&self, req: CheckpointRequest) -> Result<CheckpointRef>;
    async fn restore(&self, req: &CheckpointRef) -> Result<RestoredState>;
    async fn forget(&self, req: ForgetRequest) -> Result<ForgetReceipt>;
    async fn export(&self, req: ExportRequest) -> Result<ExportReceipt>;
    async fn explain_retrieval(&self, req: ExplainRetrievalRequest) -> Result<RetrievalTrace>;
}
```

---

## Methods

| Method | Summary | Detailed spec |
|--------|---------|---------------|
| **`retain`** | Ingest episodes, facts, artifacts, preferences; commit Postgres + outbox | [`retain.md`](retain.md) |
| **`recall`** | Multi-route retrieval → `MemoryBundle` w/ L0–L3 | [`recall.md`](recall.md) |
| **`reflect`** | Consolidate facts → observations; update beliefs | [`reflect.md`](reflect.md) |
| **`checkpoint`** | Persist execution state + artifact manifest | [`checkpoint-restore.md`](checkpoint-restore.md) |
| **`restore`** | Hydrate execution state from checkpoint ref | [`checkpoint-restore.md`](checkpoint-restore.md) |
| **`forget`** | Tombstone + index purge + cache invalidation | [`forget-export.md`](forget-export.md) |
| **`export`** | Portability / subject-rights export | [`forget-export.md`](forget-export.md) |
| **`explainRetrieval`** | Return `RetrievalTrace` for debugging & compliance | [`explain-retrieval.md`](explain-retrieval.md) |

---

## Cross-cutting request metadata

All requests SHOULD accept:

| Field | Purpose |
|-------|---------|
| `tenantId`, `workspaceId` | Isolation |
| `actorId` | Policy + audit |
| `traceId` / `spanId` | Distributed tracing correlation |
| `clientMutationId` / `Idempotency-Key` | Safe retries on mutating calls |

All **denials** map to Policy `DENY` with stable `error.code` values (`policy.memory.read.denied`, etc.).

---

## Security & observability

- **Policy** evaluates before any storage side-effect (`memory.read`, `memory.write`, `memory.forget`, `checkpoint.restore`, export permissions).
- **Audit** appends hash-chained records on mutating operations and sensitive reads.
- **Tracing** spans per recall route are mandatory for production SLO dashboards.

See [`../01-architecture/README.md`](../01-architecture/README.md) for the architectural diagram.
