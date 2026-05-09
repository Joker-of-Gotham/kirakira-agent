# 时间路由 — Temporal Route

`TemporalRecallRoute`（`packages/memory-service/src/recall/routes/temporal-route.ts`）在存在 **时间窗口** 时，从系统记录中拉取候选集合，再按 **有效时间（valid_from / valid_to）** 与窗口的交集过滤。

返回上级：[`README.md`](README.md)。

---

## 激活条件

当 `RecallRouteInput.timeWindow` 缺少 `from` 与 `to` 时返回空（`reason: "no_time_window"`）。通常由 [`query-planner.md`](query-planner.md) 保证仅在推断或显式提供窗口时启用本路由。

---

## 存储查询：`validAt` 与双时间轴

```typescript
const validAt = window.to ?? window.from ?? new Date().toISOString();
const rows = await store.queryRecords({
  tenantId,
  workspaceId,
  validAt,
  limit: input.limit * 2,
  tombstoned: false,
});
```

`MemoryRecordRepository` 在指定 `validAt` 时附加 SQL 条件：

- `valid_from IS NULL OR valid_from <= validAt`
- `valid_to IS NULL OR valid_to > validAt`

这对应 **「截至 `validAt` 时刻，在世界上何为真」** 的业务时间视图。

---

## 客户端二次过滤

将窗口解析为毫秒：

```typescript
const fromMs = window.from ? Date.parse(window.from) : -Infinity;
const toMs = window.to ? Date.parse(window.to) : Infinity;

rows.filter((r) => {
  const vf = r.validFrom ? Date.parse(r.validFrom) : -Infinity;
  const vt = r.validTo ? Date.parse(r.validTo) : Infinity;
  return vf <= toMs && vt >= fromMs;
});
```

即要求记录的有效期区间 **`[vf, vt]`** 与 **`[fromMs, toMs]`** 有交集（闭开边界与仅 `from` 或仅 `to` 的退化情况由 `±Infinity` 处理）。

> **事务时间 `tx_from` / `tx_to`**：本路由当前主要依赖 `validAt` 取「已知为真」切片；若需「截至某 ingestion 时刻我们知道什么」应扩展 `queryRecords` 传 `txAt`（repository 已支持，参见 `memory-record-repo.ts`）。

---

## 打分

截断后按顺序 `score = 1/(i+1)`，与图路由类似的倒数位次分，交由全局 RRF 统一度量。

---

## 与时间表达式解析的关系

Planner 侧把「上周」「Q2 2024」等变为 **`timeWindow` ISO 边界**；Temporal 路由 **不重新解析** 自然语言，保持职责单一。

---

## 建议扩展

- **半开/闭区间策略** 与业务日历对齐（财政周、交易日）。
- 显式支持 `txAt` 参数自 `RecallRequest` 透传，用于审计回放。
