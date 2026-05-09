# 性能目标

本文档概括记忆平面的 **SLO**、**监控与指标采集** 思路及 **关键绩效指标（KPI）**，与 [容量规划](capacity-planning.md)、[扩展策略](scaling.md) 互补。

上级文档：[`../README.md`](../README.md) · 测试侧 SLO 与基准：[`../13-testing/benchmarks.md`](../13-testing/benchmarks.md)。

---

## SLO 总览

以下为 **面向产品** 的延迟目标（p95）。实现参考常量：`packages/memory-core/src/constants.ts` 中的 `PERFORMANCE_TARGETS`（可与下表收敛一致）。

| 能力 | SLO（p95） | 边界说明 |
|------|------------|----------|
| **retain 同步提交** | < 100 ms | Postgres 事务内领域写入 + **`outbox`**；不含 Redis Stream 消费与向量/图物料化 |
| **recall（四路并行）** | < 200 ms | `QueryPlanner` 调度四条检索路由、RRF 融合与重排 **`BudgetCompiler` 之前的主路径**；强依赖热缓存与索引局部性 |
| **checkpoint（行内）** | < 50 ms | 小 `state_json` 直接落在 `checkpoints` 行内 |
| **checkpoint（blob 溢出）** | < 500 ms | 大块状态写入 **S3/MinIO**，`artifact_meta` 登记 |
| **forget（同步登记）** | < 300 ms | 墓碑/删除作业入队 + outbox；异步物理删除不计入 |

**一致性提示：** `retain` 与 `forget` 的「快」来自 **只做系统记录 + 可靠 outbox**；真实向量/图 eventual consistency 的滞后由管线 SLA 单独监控（队列深度、消费者 lag）。

---

## 监控与指标采集

| 层次 | 采集点 | 代表信号 |
|------|--------|----------|
| **API / 服务** | `MemoryService` 各方法耗时直方图 | `retain`、`recall`、`checkpoint`、`forget` 的 p50/p95/p99 |
| **存储** | Postgres `pg_stat_statements`、复制延迟 | 慢查询、`outbox` 轮询、分区裁剪是否命中 |
| **缓存与队列** | Redis `XINFO GROUPS`、Stream lag、`kirakira:lock:*` 竞争 | 物料化积压、死信比例 |
| **向量** | Qdrant API 延迟、集合大小、磁盘 | 检索 RT、quantization 配置影响 |
| **图** | Neo4j 事务耗时、页缓存命中率 | Cypher 热点、度膨胀节点 |
| **对象** | MinIO/S3 API latency、LIST 频率 | 大 checkpoint 读写尾延迟 |
| **可观测追踪** | `retrieval_traces`（见 `08-store-layer/postgres.md`） | 各路召回耗时、融合分数分布 |

**统一字段：** 所有指标应携带 `tenant_id` / `workspace_id`（或哈希）以便 **多租户隔离** 与热点租户定位。

---

## 关键绩效指标（KPI）

| KPI | 定义 | 业务含义 |
|-----|------|----------|
| **Recall 成功率** | 抽样评估中正确记忆落入 Top-k 的比例 | 与 [LongMemEval / LoCoMo](../13-testing/benchmarks.md) 对齐 |
| **retain→recall 一致延迟** | outbox 消费完成 → 向量可查的 **p95 滞后** | 反映「写完多久可被搜到」 |
| **Outbox 滞留** | `outbox` 中 `status=pending` 行数或最老 `available_at` | 异步路径健康度 |
| **每租户 QPS @ SLO** | 在给定租户混合负载下仍能维持 p95 的请求速率 | 容量与限流基线 |
| **存储增长率** | Postgres / Qdrant / Neo4j / 对象存储 **按 workspace 日增量** | 驱动分区与生命周期策略 |

---

## 文档索引

| 文件 | 内容 |
|------|------|
| [`capacity-planning.md`](capacity-planning.md) | 每千会话存储粗算、`memory_records` 月分区、索引维护节奏 |
| [`scaling.md`](scaling.md) | 各组件水平扩展、冷热分层、保留策略与 recall 预算 |
