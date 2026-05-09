# 时点查询与调试（Time Travel）

**双时态**将「世界中何为真」与「系统何时知晓」分离。Checkpoint **按 step 离散**记录运行态；**图与关系行**支持连续时间轴查询，便于审计与调试。

返回上级：[`README.md`](README.md)。

---

## 图：有效时间（Neo4j）

`Neo4jTemporal.queryValidAt(nodeId, timestamp)`：

- 边需满足 `valid_at ≤ T`、`invalid_at > T`、`expired_at > T`（空值表示无界）。

用于回答：**在世界时间 T，节点周边哪些关系成立？**

---

## 图：双时态（Neo4j）

`queryBiTemporal(nodeId, validAt, txAt)` 增加：

- `created_at ≤ txAt`（系统已写入）
- `expired_at > txAt`（系统未逻辑删除）

用于回答：**在 validAt 世界状态下，截至 txAt 事务时刻我们采纳了哪些边？**

---

## Postgres：`MemoryRecord` 查询

`MemoryRecordRepository.query`：

| 参数 | 语义 |
|------|------|
| `validAt` | `valid_from` / `valid_to` 夹住 |
| `txAt` | `tx_from` / `tx_to` 事务窗口 |

Recall **TemporalRoute** 当前使用 `validAt` + 客户端区间；可扩展请求体以传 **`txAt`** 做「已知历史」调试。

---

## Checkpoint 与事件日志

对 run **按 `step_no` 排序**重放 checkpoint，可与 **event-store** 事件穿插对照，定位 **哪一步状态漂移**。

---

## 实践建议

- 调试 UI 并列 **`valid`** / **`tx`** 过滤器并显示时区。
- 大 state 走 blob 后，时点取证需同时保留 **checkpoint 行** 与 **对象版本**。
