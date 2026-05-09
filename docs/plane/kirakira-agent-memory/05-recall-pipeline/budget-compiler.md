# 预算编译器 — Budget Compiler

`BudgetCompiler`（`packages/memory-service/src/recall/budget/budget-compiler.ts`）将最终 **MemoryRecord 列表** 编译为 **`ContextBundle`（L0–L3）**，并在超出 `tokenBudget` 时 **逐级降级** 级别。Token 估算：`estimateTokensSync`（`token-estimator.ts`，tiktoken 风格）。

返回上级：[`README.md`](README.md)。

---

## 输入

| 参数 | 含义 |
|------|------|
| `records` | 重排后的最终 `MemoryRecord[]` |
| `queryId` | 追踪标识 |
| `explanations` | `recordId` → `routeReason`、`score` |
| `tokenBudget` | 硬预算 |
| `level` | 期望 `ContextLevel`（`L0`…`L3`） |

---

## 降级策略

对Records 拼接 `text` + `summaryL0` 估算累积 token：

1. 若 **超出** 预算且目标 **L3** → 将 **`effectiveLevel` 降为 L2**，`degradationReason = "budget_exceeded_downgrade_L3_to_L2"`。
2. 仍超出且当前 **L2** → **L1**，`"budget_exceeded_downgrade_to_L1"`（若尚无原因）。
3. 仍超出且 **L1** → **L0**，`"budget_exceeded_downgrade_to_L0"`。

> 降级**只影响**是否包含 l1/l2/l3 块；**L0 始终存在**。

---

## 各级别内容

### L0 — `ContextL0`

| 字段 | 来源 |
|------|------|
| `abstract` | `Recall summary for query {queryId}: {n} records, {entityCount} entities.` |
| `entityCount` | 所有 `entityIds` 去重 |
| `timeWindow` | 首条非空 `validFrom` / `validTo` |
| `estimatedTokens` | 对 `abstract` 估算 |

### L1 — `ContextL1`（若有效级别 ≥ L1）

| 字段 | 来源 |
|------|------|
| `factSummaries` | `kind ∈ {fact, observation}` 的 `summaryL0` 或 `text[:240]` |
| `observationSummaries` | `kind === observation` 的 `overviewL1 ?? summaryL0` |
| `stateSummary` | 首条 `kind === checkpoint` 的 `summaryL0` |
| `estimatedTokens` | 事实/观察文本 + state 之和 |

### L2 — `ContextL2`（≥ L2）

- 最多 **24** 条 **cards**：`id`, `kind`, `summary`, `provenance`（`evidenceIds.join(',')`）, `routeReason`, `score`。
- `estimatedTokens`：所有 `summary` 之和。

### L3 — `ContextL3`（= L3 且未再降级）

每条 evidence：

| 字段 | 来源 |
|------|------|
| `sourceRecordId` | `record.id` |
| `rawSpan` | `record.text` |
| `artifactPointer` | `metadata.artifactUri`（字符串时） |
| `graphPath` | 当前 **undefined**（预留） |
| `checkpointState` | `kind === checkpoint` 时的 `metadata` |

---

## 输出：`BudgetCompileResult`

```typescript
{
  context: ContextBundle,   // queryId, levels, totalEstimatedTokens
  effectiveLevel: ContextLevel,
  degradationReason?: string
}
```

`RecallPipeline` 将 `effectiveLevel`/`degradationReason` 写入 `RetrievalTrace`。

---

## `ContextAssembler` 关系

`context-fs.ts` 内 **`ContextAssembler`** 复用 `BudgetCompiler`，但会用 **用户查询** 重写 L0 `abstract`（`Q: ... · hits · entities`）。两者在级别语义上应保持一致 — 变更字段时需同步。

---

## 配置建议

- **`defaultTokenBudget`**：在 `MemoryServiceConfig.recall`。
- **卡片数 24** / **L3 全量 evidence**：大数据集时可改为 top-k + lazy 拉取。
- 降级后仍在 L0 超标：需在 **上游** 减少 `limit` 或摘要 records。
