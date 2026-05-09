# 矛盾解决 — Contradiction Resolution

`ContradictionResolver`（`contradiction-resolver.ts`）在 **反思合并前** 扫描**事实簇**内的 **二元矛盾**，通过置信与新鲜度裁定保留哪条，并对败者执行 **tombstone**。

返回上级：[`README.md`](README.md)。

---

## 矛盾检测 — `detectContradictions`

预处理：事实按 `createdAt` **降序**（新的在前）。

对每对 `(a,b)` 构造小写文本 `ta,tb`（`text + summaryL0`）：

| 条件 | 说明 |
|------|------|
| **否定失配** | `NEGATION` 正则测试：`not|no longer|never|false|isn't|aren't|wasn't|weren't` — 两侧 **一真一假** |
| **主题重叠** | `entityIds` 有交集 **或** 长度>4 的词在两侧共同出现 **≥3** |

若同时满足，则记录矛盾对，分数 `0.65 + 0.1 * sharedEntityCount`。

---

## 解决策略 — `resolvePair`

令 `ca, cb` 为置信度（默认 0.7）。

1. 若 **置信不同**：**高置信者胜**，理由 `higher_source_confidence`。
2. 若 **置信相同**：**更新者胜**（`createdAt` 更大者胜），理由 `higher_recency_tie_break`。

胜者的 `id` → `winnerId`，败者 → `loserId`。

---

## 与管道集成

`ReflectPipeline` 对每个矛盾对：

```typescript
await store.tombstoneRecord(res.loserId, res.reason);
```

并在收据 `contradictions` 数组中记录 `factId`（胜者）、`conflictsWith`（败者）、`resolution`。

---

## 限制与改进

- **纯启发式**：无语义等同或数值区间推理；可能出现假阳性。
- **不处理三者循环矛盾**；仅成对。
- 可接入 **NLP 矛盾分类器** 或 **知识库约束** 替换正则。

---

## 配置参考

- 调整 `NEGATION` 列表以覆盖多语言否定缀。
- 将 `topicOverlap` 的词长阈值 **4**、匹配数 **3** 暴露为租户配置。
