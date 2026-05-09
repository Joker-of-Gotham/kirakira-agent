# 容量规划

本文档提供记忆平面 **存储粗算**（按每 1000 会话近似）、**`memory_records` 分区策略** 与 **索引维护** 节奏，便于运维与成本预估。数字为 **数量级规划假设**，应以实际 embedding 维度、压缩与平均文本长度为校准输入。

上级文档：[`README.md`](README.md)。

---

## 每千会话存储估算

假设：平均每会话产生 **1 条 episode 行**、**若干 `memory_records`（事实/观察等）**、**对应向量点**、**中等规模图增量** 及 **可选 episode 正文 blob**。下表为 **保守工程估算**。

| 存储 | 约 / 1K 会话 | 主要组成 | 实现与配置参考 |
|------|----------------|----------|----------------|
| **Postgres** | **~50 MB** | `memory_records`（含索引、TOAST）、`episodes` / `episode_segments`、**`outbox` 短期积压**、`retrieval_traces` 保留窗 | `packages/memory-store/src/postgres/migrations/`、[`08-store-layer/postgres.md`](../08-store-layer/postgres.md) |
| **Qdrant** | **~200 MB** | **1536 维** dense 向量（float32 粗算约 6 KB/向量）+ payload + HNSW 图结构开销；混合稀疏向量另加 | `packages/memory-vector/`、[`09-vector-layer/qdrant.md`](../09-vector-layer/qdrant.md) |
| **Neo4j** | **~30 MB** | 实体节点、关系边、索引与事务日志摊销（与图密度强相关） | `packages/memory-graph/`、[`10-graph-layer/neo4j.md`](../10-graph-layer/neo4j.md) |
| **S3 / MinIO** | **~500 MB** | **原始 episode 正文**、大 checkpoint、导出包（含多版本时更高） | [`08-store-layer/blob.md`](../08-store-layer/blob.md)、`BLOB_PATHS`（`packages/memory-core/src/constants.ts`） |
| **Redis** | **~10 MB / workspace** | 热召回包、实体解析缓存、限流计数器、短生命周期锁（非全量历史） | [`08-store-layer/redis.md`](../08-store-layer/redis.md)、`REDIS_KEY_PREFIX` |

**换算示例：** 10 万活跃会话 ≈ Postgres **~5 GB**、Qdrant **~20 GB**、Neo4j **~3 GB**、对象存储 **~50 GB**（线性外推，忽略压缩与去重）。

---

## 分区策略：`memory_records`

官方设计：按 **`created_at` 的 UTC 月** 做 **RANGE 分区**，子分区命名 `{table}_{YYYY}_{MM}`，并保留 **DEFAULT** 分区兜底。

| 项目 | 说明 |
|------|------|
| **DDL 来源** | `packages/memory-store/src/postgres/migrations/` |
| **运行时 ensuring** | `packages/memory-store/src/postgres/partition-manager.ts` 中 `ensurePartitions` |
| **运维目标** | 稳态写入落在 **月分区**，避免长期向 DEFAULT 追加导致规划器退化 |
| **清理** | 在合规确认后 **DETACH / DROP** 历史分区，或与 `deletion_jobs`、WORM 策略协调 |

**规划节奏：** 建议 **每月**（或按数据量 **每周**）预创建未来 1–3 个月分区窗口，并与监控中「DEFAULT 分区行数占比」联动告警。

---

## 索引维护计划

索引设计见 [`08-store-layer/postgres.md`](../08-store-layer/postgres.md)（BTREE、GIN on JSONB、`outbox` 轮询键等）。

| 活动 | 频率 | 目的 |
|------|------|------|
| **`VACUUM (ANALYZE)`** | 高频自动 + 大删除后手动 | 控制膨胀、更新统计信息；**forget** 大批量后尤为重要 |
| **分区级 `REINDEX`** | 每季度或 bloat 超阈 | 重建长期扫表索引，降低随机 I/O |
| **`retrieval_traces` 保留轮转** | 按产品（如 7–30 天） | 防止观测表挤占主库 |
| **Qdrant payload 索引审计** | 发布/扩容后 | 确认过滤字段与 **tenant 隔离** payload 命中计划 |
| **Neo4j 统计与索引** | 图模式变更后 | 新标签/关系类型后更新约束与复合索引 |

**注意：** 月分区 + 时间范围查询应形成 **分区裁剪**；若 ORM/查询未带 `created_at` 或 `valid_*` 约束，可能导致全分区扫描，容量模型失效。
