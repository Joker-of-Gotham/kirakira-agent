# 信念管理 — Belief Management

**Belief** 表示在多条 **Fact** 支持下的**推断陈述**，带 **置信度** 与可追溯 **`evidenceIds`**。`BeliefManager`（`belief-manager.ts`）负责从事实簇实例化信念，并提供 **支持 / 反驳** 增量更新公式。

返回上级：[`README.md`](README.md)。

---

## 从事实簇创建信念 — `createBeliefFromFacts`

| 步骤 | 逻辑 |
|------|------|
| **陈述** `text` | 至多 **5** 条 fact 的 `text ?? summaryL0` 用 ` · ` 拼接；空则 `"consolidated belief"` |
| **支持集** | `support = cluster.map(f => f.id)` |
| **平均置信** | `avgConf = mean(f.confidence ?? 0.7)` |
| **belief confidence** | `min(1, avgConf + 0.05 * min(support.length, 4))` |

输出 `MemoryRecord`：`kind: "belief"`，`metadata.derivedFromFactIds` 与 `evidenceIds` 均指向支持事实，`entityIds` 为簇内并集。

**直觉**：更多一致支持事实略抬升信念置信，但有上限 1.0。

---

## 证据驱动的置信调整 — `adjustConfidenceForEvidence`

\[
\text{next} = \text{clip}_{[0.05,0.99]}\bigl(\text{base} + 0.12 \cdot \Delta_{sup} - 0.18 \cdot \Delta_{ref}\bigr)
\]

| 符号 | 含义 |
|------|------|
| `base` | 原 `belief.confidence` 或默认 **0.65** |
| `supportDelta` | 新增支持证据强度（调用方定义，通常为 \[0,1\]） |
| `refuteDelta` | 新增反驳证据强度 |

**非对称性**：反驳权重 **0.18** 大于支持 **0.12**，体现「证伪更容易降低信念」。

更新后刷新 `txFrom` 为当前 ISO 时间以便事务时间轴追踪。

---

## 与 Observation 的产出顺序

在当前 `ReflectPipeline` 中：**先** 插入 **Observation**，**再** `createBeliefFromFacts` **插入 Belief**。两者共享同一 `evidenceIds` 集合的不同语义角色：

- Observation：**人类可读摘要**
- Belief：**带置信的可推理命题**

---

## Python `belief_updater.py`

管道包内可选实现可对齐 enterprise 策略（阈值、衰减）；TypeScript 侧公式为 **默认参考实现**。

---

## 操作建议

- 将 **refute** 链显式存入 `metadata.refutedBy`（若核心类型扩展）。
- 对高 **piiLevel** 的 fact 禁止晋升 belief，或强制脱敏（配合 governance）。
