# 查询计划 — Query Planner

`planRecallQuery`（`packages/memory-service/src/recall/query-planner.ts`）在不访问外部索引的情况下，从 `RecallRequest` 推导 **规范化查询**、**实体线索**、**时间窗**与**应激活的路由**，并为每路由分配 **候选条数上限**。

返回上级：[`README.md`](README.md)。

---

## 输出：`QueryPlan`

| 字段 | 含义 |
|------|------|
| `normalizedQuery` | `trim` + `toLowerCase()` |
| `entityReferences` | `req.entityIds` ∪ 启发式抽取的实体串 |
| `timeWindow` | `req.timeWindow` 或从查询解析的隐含窗口 |
| `activeRoutes` | `similarity` / `graph` / `temporal` / `state` 的子集 |
| `perRouteLimit` | 与 token 预算相关的每路由 `limit` |
| `tokenBudget` | 来自请求或默认值 |

---

## 实体抽取

内联启发式（**非**完整 NER）：

- **首字母大写序列**：`\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b`
- **引号短语**：双引号或单引号内容

与请求体 `entityIds` 合并去重，最多保留 **24** 条，写入 `entityReferences`，供 **Graph** 与 **Similarity** 过滤使用。

---

## 时间窗口解析

在 **`req.timeWindow` 未提供** 时，若查询匹配下列模式之一则推断窗口（参考时间 `ref = new Date()`）：

| 模式 | `from` / `to` |
|------|----------------|
| **相对日** `yesterday` / `today` / `tomorrow` | 对应日 **UTC 00:00** 起，至 `ref` ISO。 |
| **近周** `last week` / `past 7 days` | `ref - 7d` 至 `ref`。 |
| **近月** `last month` / `past 30 days` | `ref - 30d` 至 `ref`。 |
| **季度** `Q1 2024` 形式 `\bQ([1-4])\s+(\d{4})\b` | 季度首月 1 日 UTC 至 **下一季度首日**（半开区间 `[\"from\",\"to\")`）。 |

> 日期语义以 **UTC** 边界简化；生产可按用户时区细化。

---

## 路由激活逻辑

- **默认**：四条路由全部加入计划。
- **移除 `temporal`**：若最终 `timeWindow` 为空（既无请求也无推断）。
- **移除 `state`**：当 **无** `runId` 且 **无** `sessionId`，且查询不匹配 `(checkpoint|run|session|tool|approval)`（忽略大小写）。

---

## `perRouteLimit` 计算

```typescript
const tokenBudget = req.tokenBudget ?? defaults.tokenBudget;
const base = max(8, min(64, floor(tokenBudget / 256)));
perRouteLimit = {
  similarity: base * 2,
  graph: base,
  temporal: base,
  state: max(4, floor(base / 2)),
};
```

意为：**预算越大，每路召回的上限越高**，但硬性夹在 \[8,64\] 的 `base` 衍生范围内，避免单一查询拖垮索引。

---

## 与 `RecallPipeline` 的衔接

- `normalizedQuery` 传入相似度路由构造 **稀疏向量**。
- `entityReferences` → `RecallRouteInput.entityIds`。
- `timeWindow` → 时间路由与图遍历过滤。
- `activeRoutes` 过滤已注册的 `RecallRoute` 实现列表。

---

## 扩展建议

- 接入 **命名实体识别** 服务替换正则。
- `timeWindow` 支持 ISO 8601 区间与自然语言 **datetime** 库解析。
- 按 **租户策略** 关闭 `graph` 或强制 `temporal`（合规场景）。
