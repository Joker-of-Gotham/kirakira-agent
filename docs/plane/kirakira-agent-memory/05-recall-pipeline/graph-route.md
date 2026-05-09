# 图路由 — Graph Route

`GraphRecallRoute`（`packages/memory-service/src/recall/routes/graph-route.ts`）从 **实体 ID** 与查询中内嵌的 **UUID** 出发，在图适配器上执行 **有界深度遍历**，收集相邻 **记忆投影节点** 并映射回 `MemoryRecord`。

返回上级：[`README.md`](README.md)。

---

## 起点集合

```typescript
const starts = [...new Set([...input.entityIds, ...centralEntityIds(input.query)])];
```

- **`centralEntityIds`**：匹配标准 UUID v1–v5 正则（36 字符带连字符）。
- 若 `starts.length === 0`，**短路**返回空结果（图路由不参与有效召回）。

---

## 遍历参数

调用 `graph.traverse`：

| 参数 | 值 |
|------|-----|
| `startNodeIds` | `starts` |
| `edgeTypes` | `undefined`（全类型） |
| `maxDepth` | **2** |
| `timeWindow` | 自查询计划传入；`Neo4jReader` 在路径级过滤关系 **`valid_at` / `invalid_at`** |
| `limit` | `input.limit * 3`（扩大候选池再截断） |

**时间过滤语义（Cypher）**：对路径上每条边 `rel` 要求  
`(twFrom IS NULL OR rel.invalid_at IS NULL OR rel.invalid_at >= twFrom)` 且  
`(twTo IS NULL OR rel.valid_at IS NULL OR rel.valid_at <= twTo)` — 与数据模型「有效期」一致（详见 [`../10-graph-layer/neo4j.md`](../10-graph-layer/neo4j.md)）。

---

## 节点 → 记录 ID 提取

兴趣标签集合：`Fact`, `Observation`, `Episode`, `Entity`。

对每个遍历节点：

- 若 `label` 在集合内且 `props.sourceRecordId` 为字符串 → 加入候选 ID。
- 若 `label` 为 `Fact` 或 `Episode` 且 `props.id` 为字符串 → 亦加入（兼容仅写图本地 id 的材质化）。

按遍历顺序去重，**顺序打分** `score = 1/rank`；租户校验 `rec.tenantId === input.tenantId` 后保留，直至 `input.limit`。

---

## 层次与社群（概念）

- **深度 2** 覆盖一跳关联事实与二跳桥接实体，平衡延迟与噪音。
- **社群发现**（Louvain 等）在 `Neo4jCommunity` 中实现，可用于 **离线** 给实体打 `ConceptCluster`；在线路由当前未直接按社区扩展，可作为后续 `routeReason` 增强。

---

## 与其它路由的协同

图路由擅长 **结构化关联**（实体桥接）；弱于纯语义 paraphrase — 由 **Similarity** 路补齐。全局 **RRF** 在 [`fusion-rerank.md`](fusion-rerank.md) 合并两路。

---

## 排错清单

| 现象 | 可能原因 |
|------|-----------|
| 始终为空 | 未解析出实体 / UUID；或图未材质化 |
| 结果陈旧 | `timeWindow` 与边上 `invalid_at` 不交集 |
| tenant 过滤掉行 | `sourceRecordId` 指向它租记录 |
