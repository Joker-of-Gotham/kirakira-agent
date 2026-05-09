# 事件分类 — 来源类型、启发式与重要性

本文说明 `MemoryEventClassifier` 如何将原始文本与可选元数据映射为 **Episode 来源类型**、**实体提示**、**建议记忆种类**与 **估计重要性**。实现：`packages/memory-service/src/retain/event-classifier.ts`。

返回上级：[`README.md`](README.md)。

---

## `EpisodeSourceType` 映射

| 取值 | 判定顺序 |
|------|-----------|
| **`metadata.sourceType`** | 若元数据中字符串为 `tool` / `file` / `web` / `sandbox` 之一，**直接采用**（最高优先级）。 |
| **`tool`** | 正文匹配 `(ran\|tool result\|stdout\|stderr)` 等工具执行痕迹（不区分大小写）。 |
| **`web`** | 正文含 `http://` 或 `https://`。 |
| **`chat`** | 默认回退。 |

> `file` / `sandbox` 通常由上游在元数据中显式标注；纯启发式当前不区分二者与 `chat`。

---

## 实体类提示（`entityHints`）

用于下游检索与图对齐的轻量信号，**不是**严格的 NER：

- **首字母大写短语**：`\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\b`（连续 1–3 个英文专名片段）。
- **引号片段**：双引号或单引号内 2–64 字符。
- **@ 句柄**：`@[\w.-]+`。

去重后最多保留 **32** 条。`hasEntities = entityHints.size > 0`。

---

## 事实 / 偏好 / 信念信号

| 字段 | 规则 |
|------|------|
| **`hasFacts`** | 命中 `is/are/was/were/equals/defined/means/requires/always/never` 等词 **且** 文本长度 **> 24**，或含百分比 / `YYYY-MM-DD` 日期样式。 |
| **`hasPreferences`** | `i prefer`、`we should always`、`never do`、`like it when`、`dislike` 等偏好用语。 |
| **`suggestedMemoryKinds`** | 基础含 `episode`；有事实信号追加 `fact`；有偏好追加 `preference`；若含 `because/therefore/conclude/belief` 追加 `belief`。 |

---

## 估计重要性 `estimatedImportance`

在 **[0, 1]** 上截断的加权和：

\[
\text{score} = \min\left(1,\; 0.15 + 0.4\cdot L + E + F + P + S\right)
\]

其中：

| 因子 | 权重/公式 |
|------|-----------|
| **长度因子 \(L\)** | `min(1, len(text)/2000)` |
| **实体 \(E\)** | 有实体提示：**+0.25** |
| **事实 \(F\)** | `hasFacts`：**+0.35** |
| **偏好 \(P\)** | `hasPreferences`：**+0.2** |
| **惊奇 \(S\)** | 含 `!` 或 `important/critical/urgent/must`：**+0.15** |

该分数进入 `Episode.segmentationScore` 元数据，并作为 `RetentionScorer` 融合项之一（见 [`predict-calibrate.md`](predict-calibrate.md)）。

---

## 配置与扩展建议

- **多语言**：当前正则偏英语；生产可结合语言检测切换规则或跳过专名启发式。
- **策略注入**：可通过 Policy 平面在写入前覆盖 `metadata.sourceType` 或 `piiLevel`，分类器仍会继续计算启发式字段供追踪。

---

## 代码参考

```typescript
// metadata 优先
if (metaSource === "tool" || metaSource === "file" || metaSource === "web" || metaSource === "sandbox") {
  sourceType = metaSource;
}
```

分类结果完整结构见 `ClassifiedMemoryEvent`（`sourceType`、`estimatedImportance`、`entityHints`、`suggestedMemoryKinds` 等）。
