# Neo4j — Schema、双时态与社群

核心路径：`packages/memory-graph/src/neo4j/`。返回上级：[`README.md`](README.md)。

---

## `Neo4jAdapter` 组成

| 组件 | 职责 |
|------|------|
| `Neo4jSchemaManager` | `CREATE CONSTRAINT` / `RANGE INDEX` / `FULLTEXT INDEX` |
| `Neo4jWriter` | 节点/边 MERGE + 双时态属性 |
| `Neo4jReader` | `traverse`、`findNeighbors`、`searchByText` |
| `Neo4jTemporal` | 失效、valid-at、双时态查询 |
| `Neo4jCommunity` | GDS Louvain / 标签传播 |

---

## 节点唯一性（`NODE_CONSTRAINTS`）

以下标签在 **`id`** 上 **UNIQUE**：  
`Entity`, `Episode`, `Fact`, `Observation`, `Belief`, `Artifact`, `Run`, `Checkpoint`, `ConceptCluster`。

---

## 索引（`NODE_INDEXES`）

- **BTREE**：`Entity.tenant_id`、`Fact.tenant_id`、`Episode.tenant_id`、`Episode.created_at`。
- **FULLTEXT**：`Entity.name` — `searchByText` 使用 `CALL db.index.fulltext.queryNodes`。

---

## 双时态边（`Neo4jWriter`）

`MERGE` 关系时写入：

| 属性 | 含义 |
|------|------|
| `valid_at` / `invalid_at` | **业务有效时间**（区间语义配合查询） |
| `created_at` | 首次写入时间 `coalesce(r.created_at, datetime())` |
| `expired_at` | 由 `Neo4jTemporal.invalidateEdge(s)` 写入，与 `invalid_at` 同步更新 |

与核心类型枚举 **`EDGE_TYPES_WITH_TEMPORAL`** 对齐：`ABOUT`, `DERIVED_FROM`, `SUPPORTS`, `REFUTES`。

---

## 遍历与时间窗（`Neo4jReader.traverse`）

可变长度模式 `(start)-[r*{1..maxDepth}]-(end)`；若提供 `timeWindow`，路径上 **每条** 关系需满足：

- `twFrom`：`rel.invalid_at` 为空或 `>= twFrom`
- `twTo`：`rel.valid_at` 为空或 `<= twTo`

与 Recall Graph 路由默认 `maxDepth=2` 配合。

---

## 时点查询（`Neo4jTemporal`）

| 方法 | 用途 |
|------|------|
| `queryValidAt(nodeId, timestamp)` | 某一 **valid** 时刻下的邻接边 |
| `queryBiTemporal(nodeId, validAt, txAt)` | **valid** 区间 ∩ **transaction** 区间（`created_at` / `expired_at`） |

详见 [`../11-checkpoint-restore/time-travel.md`](../11-checkpoint-restore/time-travel.md)。

---

## 社群检测（Louvain）

`Neo4jCommunity.detectCommunities`：

1. `gds.graph.project.cypher` 限定 `tenant_id`。
2. `gds.louvain.stream`（`auto` 模式失败则 fallback `label_propagation`）。
3. `gds.graph.drop` 清理投影。

需 **Neo4j GDS** 插件。结果可写 `ConceptCluster` + `IN_CLUSTER`（`assignToCommunity`）。

---

## 全文与覆盖 recall

`searchByText`：全文命中实体后，可选返回 **诱导子图**边（端点均在命中集合）。用于 **实体定位 + 层级扩展**，与向量路由互补。
