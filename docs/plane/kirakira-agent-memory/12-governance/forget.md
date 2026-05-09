# 遗忘（Forget）— 墓碑、索引与作业

`ForgetService`（`packages/memory-service/src/governance/forget-service.ts`）实现 **`memory.forget`**：在授权后 **软删权威行** 并 **净化物化索引**。

返回上级：[`README.md`](README.md)。

---

## 解析待删 ID

1. `recordIds` 非空 → 直接用。
2. 否则若 `beforeDate` 存在：`queryRecords`（单批最多 **2000**），筛 `createdAt ≤ beforeDate`。

`dryRun: true` → 仅返回 `tombstonedIds` 预览，**不写库**。

---

## 执行序列（非 dry-run）

| 步骤 | 调用 |
|------|------|
| 1 | `store.tombstoneRecords(ids, reason)` |
| 2 | `vector.delete(collection, { sourceRecordIds: ids })` |
| 3 | 对每个 id：`graph.invalidateEdges(id, undefined, expiredAt)` |
| 4 | `cache.deletePattern("memory:{tenantId}:{workspaceId}:*")` |
| 5 | `store.createDeletionJob({ tenantId, recordIds, reason })` |

`graphEdgesInvalidated` 按 **调用次数**计（每 id 一次），非精确边计数。

---

## 配置

- **`vectorCollection`**：构造 `ForgetService` 时注入（需与索引侧一致）。

---

## 合规注意

- **Legal hold / WORM**：须在调用前由 **Policy + 元数据** 拦截，否则违背保留义务（见 [`worm-audit.md`](worm-audit.md)）。
- **级联**：子记录（fact → episode）是否一并删除由 **上层编排** 决定，本服务只处理传入 id 列表。

---

## Receipt 字段

`tombstonedIds`, `indexesDeleted`, `cacheKeysEvicted`, `graphEdgesInvalidated`, `dryRun`, `forgotAt`。
