# 与 `@kirakira/event-store` CheckpointRepository 的兼容性

**`PostgresCheckpointRepository`**（`packages/memory-store/src/postgres/repositories/checkpoint-repo.ts`）实现 **`CheckpointRepository`**（`@kirakira/event-store`），与 **`CheckpointManager`** 等内核组件对齐；**`CheckpointService`** 使用同类 **`checkpoints`** 表但面向 **`MemoryCheckpoint`** DTO。

返回上级：[`README.md`](README.md)。

---

## 接口：`CheckpointRepository`

| 方法 | 行为 |
|------|------|
| `save(envelope)` | 要求 `version === "kirakira.checkpoint.v1"`；拆分 `payload` 中租户、任务、manifest 等到列 |
| `load(id)` | `loadById`，返回 `CheckpointEnvelope` 或 `undefined` |

扩展（同文件）：

- `loadLatestByRunId(runId)`
- `listByRunId(runId)`
- `delete(id)` — 物理删除（慎用）

---

## Envelope → 行映射

`CheckpointEnvelope`：

- `payload` 整体写入 **`state_json`**
- 从 `payload` 提取：`tenantId`, `taskId`, `stepNo`, `artifactManifest`, `parentCheckpointId`

服务层 **`CheckpointService.save`** 直接构造 **`MemoryCheckpoint`**（含 ULID、大体积 blob 指针），与 Repository **共享表**，故 **id 空间一致**。

---

## 互操作要点

1. **同表可读**：Kernel 写入的 envelope → Service `restore` 可读（需 payload 形状兼容）。
2. **Blob 指针**：`{ __blobUri }` 由 Service 产生；纯 Repository 写入应避免超大 `state_json` 或同样溢出。
3. **UUID**：SQL 使用 `::uuid` cast — 主键须为合法 UUID 串。

---

## 代码参考

```typescript
export class PostgresCheckpointRepository implements CheckpointRepository {
  async save(envelope: CheckpointEnvelope): Promise<void> {
    if (envelope.version !== "kirakira.checkpoint.v1") {
      throw new TypeError(`unsupported checkpoint envelope version: ${String(envelope.version)}`);
    }
    // INSERT INTO checkpoints ...
  }
}
```
