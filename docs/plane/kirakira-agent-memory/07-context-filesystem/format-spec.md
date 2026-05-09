# 上下文文件系统 — 格式规范（L0–L3）

本文档逐字段定义 `ContextBundle` 及其子结构，并与 **当前实现**（`BudgetCompiler` / `ContextAssembler`）对齐。

类型定义：`packages/memory-core/src/types/context-fs.ts`。  
返回上级：[`README.md`](README.md)。

---

## `ContextBundle`

| 字段 | 类型 | 说明 |
|------|------|------|
| `queryId` | `string` | 追踪 ID；`BudgetCompiler` 使用入参 `queryId`，`ContextAssembler` 会生成 `ctx:{...}` 样式 |
| `levels` | 对象 | **必有** `l0`；`l1`/`l2`/`l3` 视有效级别 |
| `totalEstimatedTokens` | `number` | 各层 `estimatedTokens` 之和（`ContextAssembler` 以自定义 L0 覆盖时重新求和） |

---

## L0 — `ContextL0`

| 字段 | 类型 | 规范 |
|------|------|------|
| `level` | `"L0"` | 常量 |
| `abstract` | `string` | **BudgetCompiler**：`Recall summary for query {queryId}: {n} records, {entityCount} entities.` **ContextAssembler**：`Q: {query[:200]} · {n} hits · {entityCount} entities` |
| `entityCount` | `number` | 全部 records 的 `entityIds` 去重个数 |
| `timeWindow` | `{ from?, to? }` | 取首条非空的 `validFrom` / `validTo`；无则 `undefined` |
| `estimatedTokens` | `number` | 对 `abstract` 估算 |

**用途**：插入 system 前言或 UI 统计条；不承载具体事实正文。

---

## L1 — `ContextL1`

| 字段 | 类型 | 规范 |
|------|------|------|
| `level` | `"L1"` | |
| `factSummaries` | `string[]` | `kind ∈ {"fact","observation"}`：`summaryL0 ?? text[:240] ?? id` |
| `observationSummaries` | `string[]` | 仅 `observation`：`overviewL1 ?? summaryL0 ?? ""` |
| `stateSummary` | `string?` | 首条 `checkpoint` 的 `summaryL0` |
| `estimatedTokens` | `number` | 事实+观察拼接与 `stateSummary` 分别估算后相加 |

**注意**：`observation` 同时贡献 `factSummaries` 与 `observationSummaries`，便于两类视图消费。

---

## L2 — `ContextL2` 与卡片 `ContextL2Card`

| 字段 | 类型 | 规范 |
|------|------|------|
| `level` | `"L2"` | |
| `cards` | `ContextL2Card[]` | 最多 **24** 条（与 `BudgetCompiler` slice 一致） |
| `estimatedTokens` | `number` | 各 `summary` token 之和 |

**`ContextL2Card`**

| 字段 | 类型 | 规范 |
|------|------|------|
| `id` | `string` | `MemoryRecord.id` |
| `kind` | `string` | `record.kind` |
| `summary` | `string` | `summaryL0 ?? text[:200] ?? id` |
| `provenance` | `string` | `evidenceIds.join(",")` |
| `routeReason` | `string` | `RankedExplanation.routeReason`；缺省 **`"unknown"`** |
| `score` | `number` | 重排后最终分 |

---

## L3 — `ContextL3` 与证据 `ContextL3Evidence`

| 字段 | 类型 | 规范 |
|------|------|------|
| `level` | `"L3"` | |
| `evidence` | `ContextL3Evidence[]` | **每条 record 一项**（未再截断） |
| `estimatedTokens` | `number` | 各 `rawSpan` token 之和 |

**`ContextL3Evidence`**

| 字段 | 类型 | 规范 |
|------|------|------|
| `id` | `string` | 与 `sourceRecordId` 相同 |
| `sourceRecordId` | `string` | `MemoryRecord.id` |
| `rawSpan` | `string?` | 完整 `record.text` |
| `artifactPointer` | `string?` | `metadata["artifactUri"]` 为字符串时 |
| `graphPath` | `string[]?` | **预留**：当前 **undefined** |
| `checkpointState` | `Record<string,unknown>?` | `kind === "checkpoint"` 时整份 **`metadata`** |

---

## JSON 形状示例（节选）

```json
{
  "queryId": "01JABC...",
  "levels": {
    "l0": {
      "level": "L0",
      "abstract": "Recall summary for query 01JABC: 3 records, 2 entities.",
      "entityCount": 2,
      "timeWindow": { "from": "2024-01-01T00:00:00.000Z", "to": null },
      "estimatedTokens": 28
    },
    "l1": {
      "level": "L1",
      "factSummaries": ["User prefers dark mode.", "…"],
      "observationSummaries": ["…"],
      "stateSummary": "checkpoint step 4",
      "estimatedTokens": 120
    },
    "l2": {
      "level": "L2",
      "cards": [
        {
          "id": "f1",
          "kind": "fact",
          "summary": "User prefers dark mode.",
          "provenance": "seg-uuid",
          "routeReason": "fusion:0.0811; coverage+0.0400; redundancy-0.0000",
          "score": 0.095
        }
      ],
      "estimatedTokens": 42
    },
    "l3": {
      "level": "L3",
      "evidence": [
        {
          "id": "f1",
          "sourceRecordId": "f1",
          "rawSpan": "The user said they prefer dark mode in VS Code.",
          "artifactPointer": "s3://bucket/.../episode.bin",
          "graphPath": null,
          "checkpointState": null
        }
      ],
      "estimatedTokens": 256
    }
  },
  "totalEstimatedTokens": 446
}
```

---

## 实现差异备忘

| 点 | 说明 |
|----|------|
| `graphPath` | 待图追溯 API 接入后填充从实体到事实的路径标签序列 |
| `ContextAssembler.assemble` | 用用户 `query` 覆盖 L0 文案，`queryId` 与 compiler 不完全相同 |
| 降级 | 见 [`../05-recall-pipeline/budget-compiler.md`](../05-recall-pipeline/budget-compiler.md) |
