# 相似度路由 — Similarity Route

`SimilarityRecallRoute`（`packages/memory-service/src/recall/routes/similarity-route.ts`）在同一路由内组合 **稠密向量检索** 与 **伪稀疏词袋向量**，并使用 **RRF** 融合两路排序。集合名常量 **`kirakira_memory`**（与 `vector.search` 第一个参数一致）。

返回上级：[`README.md`](README.md)。

---

## 前提条件

- `RecallRouteInput.embedding` 非空；否则返回空结果，`explanation.filters.reason = "no_embedding"`。

---

## 过滤条件

写入 Qdrant / pgvector filter：

| 键 | 条件 |
|----|------|
| `tenant_id` | 必填，来自 `input.tenantId` |
| `entity_ids` | 若 `entityIds.length > 0` 则附加（向量适配器侧解析为 `match any`） |

pgvector 实现仅_dense_检索；稀疏分支在 pgvector 上会被忽略（见向量层文档）。

---

## 稀疏向量构造（启发式）

`simpleSparseFromText(normalizedQuery)`：

1. 小写、`\W+` 分词，长度 **> 2**。
2. 词频计 **`sqrt(count)`** 作为权重。
3. 词哈希至 **`vocabLimit=8192`** 桶：逐字符 `h = (h*31 + charCode) % 8192`。

返回 `{ indices, values }` 供 Qdrant **named sparse vector** 使用。

---

## 路由内双路检索与 RRF

并行执行：

1. **Hybrid**：`vector.search(collection, { denseVector, sparseIndices, sparseValues, filter, limit: limit*2 })`
2. **Dense-only**：仅 `denseVector`，同样 `limit*2`。

对两路结果分别赋予 rank，再调用：

```typescript
reciprocalRankFusion([
  { listId: "similarity:hybrid", weight, rankedIds: rankedSparse },
  { listId: "similarity:dense", weight: weight * 0.85, rankedIds: rankedDense },
], RRF_K=60)
```

截断为 `input.limit`，按融合分拉取 `StoreAdapter.getRecord`。

**设计意图**：hybrid 抓词汇对齐；dense 抓语义；**0.85** 表示略降低纯稠密榜权重以防主导。

---

## 解释输出

`RouteExplanation.candidates` 含前 20 个 `recordId`、RRF 分与名次，便于 `explainRetrieval` 展示。

---

## 调优建议

- 稀疏哈希替换成 **BM25/Splade** 出口以提升关键词可解释性。
- `vocabLimit` 与嵌入维度对齐重新评估碰撞率。
- 对多语言查询在分词前做语言检测。
