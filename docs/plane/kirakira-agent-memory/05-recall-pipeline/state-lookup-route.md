# 状态查询路由 — State Lookup

`StateLookupRecallRoute`（`packages/memory-service/src/recall/routes/state-lookup-route.ts`）为 **运行（run）**、**会话（session）** 与 **检查点** 提供专用检索入口，产出可被 budget 编译进 L1/L3 的 **`checkpoint` 类 MemoryRecord 替身** 与相关 Episode。

返回上级：[`README.md`](README.md)。

---

## `runId` 路径

1. `metaFilters` 追加 `run:${runId}`。
2. `store.listCheckpoints(runId)` 取该运行下列；**最多 3** 条。
3. 每条构造 **合成 `MemoryRecord`**：

| 字段 | 值 |
|------|-----|
| `kind` | `"checkpoint"` |
| `id` | 与 DB checkpoint id 一致 |
| `text` | `JSON.stringify(stateJson)` 截断 **2000** |
| `summaryL0` | `checkpoint step ${stepNo}` |
| `metadata` | `{ runId, checkpoint: true, stepNo }` |
| `txFrom` / `createdAt` | `cp.createdAt` |

打分：第 i 条 `1/(i+1)`。

---

## `sessionId` 路径

1. `metaFilters` 追加 `session:${sessionId}`。
2. `queryRecords` 拉取 `kinds: ["episode"]`（上限 `limit*2`）。
3. 过滤 `metadata.sessionId === sessionId` 的记录，score 常数 **0.5**。

> Episode 的 `sessionId` 在 retain 路径由 `RetainRequest.sessionId` 写入 Episode / 元数据；需保证材质化一致。

---

## 与 Planner 联动

仅当以下任一成立时保留 **`state`** 路由：

- 请求携带 **`runId`** 或 **`sessionId`**
- 或查询文本匹配 **checkpoint / run / session / tool / approval**

避免在纯知识问答上浪费 checkpoint 列表调用。

---

## 限制与注意

- **合成记录**并非 Postgres `memory_records` 行，仅在召回响应中用于上下文；持久化 checkpoint 仍以 `checkpoints` 表为准。
- **大 state**：真实还原应走 `CheckpointService.restore` + `StateHydrator`（见 [`../11-checkpoint-restore/`](../11-checkpoint-restore/)）。

---

## 扩展

- 将 `taskId` 纳入过滤。
- 合并 **审批 / 工具调用** 事件若材质化为图节点，可由 Graph 路由分担。
