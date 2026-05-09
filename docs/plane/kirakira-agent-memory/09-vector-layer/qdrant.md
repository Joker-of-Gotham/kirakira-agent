# Qdrant — 集合、混合检索与快照

实现目录：`packages/memory-vector/src/qdrant/`。返回上级：[`README.md`](README.md)。

---

## 适配器结构

| 类 | 职责 |
|----|------|
| `QdrantAdapter` | 实现 `VectorAdapter`：`ensureCollection` / `upsert` / `search` / `delete` / `createSnapshot` |
| `QdrantCollectionManager` | 建集合、HNSW、payload 索引 |
| `QdrantSearchService` | dense / sparse / hybrid + filter |
| `QdrantSnapshotService` | 集合快照 |
| `QdrantUpsertService` | 点写入 |

命名向量常量（`client.ts`）：**`dense`**、**`sparse`**。

---

## 集合创建

`ensureCollection(name, dimension, hasSparse?)`：

- **dense**：`size=dimension`，`distance: Cosine`，`hnsw_config: { m:16, ef_construct:100 }`。
- **sparse**：可选第二个命名向量空间，启用 hybrid。
- 集合名必须在 **`MEMORY_COLLECTIONS`**（否则 `VectorAdapterError`）。

---

## Payload 索引（`MEMORY_PAYLOAD_INDEXES`）

| `field_name` | `field_schema` |
|-------------|----------------|
| `tenant_id` | keyword |
| `namespace` | keyword |
| `kind` | keyword |
| `entity_ids` | keyword |
| `valid_from` / `valid_to` | datetime |
| `pii_level` | integer |
| `tombstoned` | bool |

集合创建后逐字段 `createPayloadIndex(..., wait: true)`。

---

## 检索过滤

`buildMemorySearchFilter`：

- **must**：`tenant_id` 精确匹配。
- **should**（可选）：`entity_ids` **`match any`**。
- **must_not**：`tombstoned == true`。

支持与自定义 Qdrant filter **合并**（`mergeFilters`）。

---

## 混合检索（服务端 RRF）

`hybridSearch` 当稀疏向量非空时：

1. **prefetch** 两路：`using: dense` 与 `using: sparse`，`limit ≈ max(2*limit, 20)`，共享 filter。
2. `query: { fusion: "rrf" }`，`limit` 为最终条数。
3. 稀疏缺省 → 退化为纯 `denseSearch`。

Recall 的 `SimilarityRecallRoute` 还会在应用层对 **hybrid 榜 vs 纯 dense 榜** 再做一层 RRF（见 [`../05-recall-pipeline/similarity-route.md`](../05-recall-pipeline/similarity-route.md)）。

---

## 删除

| `VectorDeleteFilter` | 行为 |
|----------------------|------|
| `ids` | 按 point id `delete` |
| `sourceRecordIds` | `payload.source_record_id` should 子句 |
| `filter` | 透传（返回计数 0，由调用方自理） |

---

## 快照

`createSnapshot(collection, { wait: true })`、`listSnapshots(collection)` — 用于备份 / 漂移恢复前检查点。

---

## 运维提示

- 嵌入维度变更需 **新集合** 或 **整库 re-embed**。
- 生产建议启用 Qdrant **复制** 与 **磁盘快照** 策略，与 Postgres outbox **对账**。
