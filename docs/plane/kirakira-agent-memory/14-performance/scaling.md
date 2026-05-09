# 扩展策略

本文档描述记忆平面各 **有状态组件** 的水平扩展方向、**冷热数据分层**、**保留策略自动化** 以及 **recall 管线的内存预算** 管理，与 [`README.md`](README.md) 中的 SLO 及 [`capacity-planning.md`](capacity-planning.md) 中的容量模型配套。

---

## 组件水平扩展

### Postgres（系统记录）

| 手段 | 说明 |
|------|------|
| **只读副本** | 将heavy **报表、explain、审计导出** 导到只读实例；同步路径仍以主库为准 |
| **分区裁剪** | `memory_records` 月分区（`partition-manager.ts`）减少扫描行数；查询必须带分区键友好谓词 |
| **连接池** | 应用侧池化（如 `postgres.js` `max`）；避免每请求新建连接压垮主库 |
| **大表生命周期** | `retrieval_traces`、`outbox` 历史归档或分表，降低主业务 bloat |

### Redis（热路径 / 流）

| 手段 | 说明 |
|------|------|
| **Cluster 模式** | 水平扩展内存与吞吐；注意 **Streams 与 Lua** 的跨 slot 约束 |
| **Consumer Groups** | 多 worker 共享 `XREADGROUP`，按 **租户或分区** 拆分 consumer 名称避免全局热点 |
| **键隔离** | 前缀见 `REDIS_KEY_PREFIX`（`packages/memory-core/src/constants.ts`） |

### Qdrant（向量）

| 手段 | 说明 |
|------|------|
| **按租户分片** | Collection 或 shard key 绑定 `tenant_id`，限制单分片体量与 blast radius |
| **collection-per-kind** | 与 `MEMORY_COLLECTIONS` 对齐（episode / fact / observation 等），便于 **不同量化与 HNSW 参数** |
| **本地磁盘与内存** | 热集合优先驻内存；温数据落盘仍 servable，但延迟需纳入 SLO |

### Neo4j（图）

| 手段 | 说明 |
|------|------|
| **因果集群（Causal Cluster）** | 核心写、只读副本扩展图查询；routing 感知会话 |
| **Read replicas** | 将 **graph route** 只读查询导向副本，降低核心压力 |
| **查询形态** | 控制多跳爆炸与全图 scan；与 recall planner 中的 **预算** 同步 |

### S3 / MinIO（对象）

| 手段 | 说明 |
|------|------|
| **原生横向扩展** | MinIO erasure coding 集群；S3 区域与 **前缀打散** 降低热点 |
| **生命周期** | 冷 tier / 过期规则与大 checkpoint 保留策略结合 |

---

## 冷热数据分层

| 层级 | 技术 | 数据特征 | 典型延迟 |
|------|------|----------|----------|
| **热（Hot）** | Redis 缓存、Qdrant **内存驻留** | 最近 workspace 的高频 recall、热点实体 | 毫秒级 |
| **温（Warm）** | Postgres 主库、Qdrant **磁盘索引** | 全量可查、异步一致 | 十毫秒–百毫秒级 |
| **冷（Cold）** | **S3 Glacier**、MinIO **tiering**、离线导出 | 合规归档、低频法证、restore 回放 | 秒–分钟级或异步 |

**设计原则：** 同步 API 只承诺 **温层 + 选择性热层**；冷层通过 **显式 restore 或预热线程** 进入温层后再服务 recall。

---

## 保留策略自动化

| 环节 | 实现挂钩 |
|------|----------|
| **策略定义** | `retention_class`、`valid_*` / `tx_*` 与治理策略（见 [`12-governance/`](../12-governance/)） |
| **执行** | `forget` API + **`deletion_jobs`** + outbox 传播至向量/图/对象 |
| **分区级清理** | 对到期且无法务保留的 **`memory_records` 月分区** 执行 DETACH/DROP（需人工或策略引擎闸口） |
| **对象存储** | S3 Lifecycle；**WORM / Legal hold** 路径禁止破坏性删除（见 `artifact_meta.worm`） |

自动化应 **可观测**：任务失败率、重试次数、死信队列与合规审计日志。

---

## Recall 管线的内存预算管理

`recall` 在融合后由 **`BudgetCompiler`**（`packages/memory-service/src/recall/budget-compiler.ts`，参见 [`05-recall-pipeline/budget-compiler.md`](../05-recall-pipeline/budget-compiler.md)）将多路候选裁剪为 **L0–L3 令牌预算** 内的 `MemoryBundle`。

| 实践 | 目的 |
|------|------|
| **硬上限** | `DEFAULT_RECALL_CONFIG.defaultTokenBudget`（`packages/memory-core/src/constants.ts`）作为默认预算基线 |
| **分级加载** | L0 摘要优先，L3 仅保留必要指针，避免单次 recall 撑爆 orchestrator 上下文 |
| **租户覆盖** | 高优先级租户 **略微抬高预算** 时，必须在网关侧限流，防止集群级 RSS 尖峰 |
| **与 rerank 协同** | `RetrievalReranker` 在预算前 **控制候选规模**，避免对大列表全量打分 |

**扩展时：** 水平加 `memory-service` 副本可线性提高并发，但 **单请求峰值内存** 仍由预算与候选条数上界决定，需在配置层留 **全局安全阀**。
