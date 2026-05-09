# 观察合并 — Observation Consolidation

将 **Fact** 按 **实体 / 主语 / 默认主题** 分簇，在调度器允许时生成单条 **Observation** 行，作为对多条事实的**压缩视图**。实现：`ReflectPipeline` + `ConsolidationScheduler`（`packages/memory-service/src/reflect/`）。

返回上级：[`README.md`](README.md)。

---

## 分簇键 `groupKeyForFact`

```typescript
if (f.entityIds.length > 0) return `entity:${f.entityIds[0]}`;
const sub = metadata["subject"];
if (sub) return `subject:${sub}`;
return "topic:default";
```

若 `ReflectRequest.scope` 存在，前缀 `${scope}:` 以隔离租户内子空间。

可选过滤：

- `factIds`：白名单
- `episodeIds`：`metadata.sourceEpisodeId` 命中

最大加载 **500** 条 fact（`limit`），再分组。

---

## 调度：何时合并

| 条件 | 行为 |
|------|------|
| 簇大小 **< 2** | 跳过 |
| **显式** `factIds` | **绕过** 24h/数量启发，仍要求簇内 ≥2 条进入处理（循环内单独簇） |
| 默认 | `groupSize ≥ 5` **或**（最老 fact 年龄 **> 24h** 且 `groupSize ≥ 2`） |

每轮最多处理 `maxGroupsPerRun` 个簇（默认上界 32，顶 256）。

---

## Observation 记录结构

| 字段 | 值 |
|------|-----|
| `kind` | `"observation"` |
| `text` / `summaryL0` / `overviewL1` | 至多 **8** 条 fact 的 `summaryL0 ?? text[:120]` 用 ` \| ` 拼接，缺省时 `"consolidated observation"` |
| `metadata.factIds` | 源 fact id 列表 |
| `evidenceIds` | 同 fact id 列表 |
| `entityIds` | 簇内全部 `entityIds` 去重 |
| `confidence` | fact `confidence` 算术平均（缺省按 0.7） |
| `namespace` / `retentionClass` / `piiLevel` | 继承簇首条 |

---

## 与异步 Outbox

成功后推送 **`memory.observation.created`**，便于：

- 向量 / 图重新嵌入 Observation
- 仪表盘或审计订阅

---

## Python 侧补充

`observation_consolidator.py` 可在管道工人中承担 **更小粒度** 或 **LLM 总结**；当前 TypeScript 路径为 **确定性字符串拼接**，成本低、可预测。

---

## 质量建议

- 对长簇使用 **主题模型** 或 **LLM 摘要** 替换 `join(" | ")`。
- 在 metadata 写入 **`consolidationVersion`** 以支持回放。
