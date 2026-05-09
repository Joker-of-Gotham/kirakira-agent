# Predict–Calibrate — 重要性预测与新颖度校准

Nemori 思想：**若现有记忆向量能“预测”新内容（高相似度），则留存优先级下降；反之新颖度高则上升**。代码中存在两条互补实现：TypeScript **Jaccard + 分类器融合**（默认同步路径）与 Python **嵌入版 PredictCalibrateScorer**（工人侧）。返回上级：[`README.md`](README.md)。

---

## 1. `RetentionScorer`（`memory-service`）

**文件**：`packages/memory-service/src/retain/retention-scorer.ts`。

### Token 化

- 小写、按 `\W+` 切分、长度 **> 2** 的 token 进入集合。

### Jaccard 新颖度

对 **新内容** 集合 \(A\) 与 **近期记忆语料** 集合 \(B\)：

\[
\text{overlap} = \frac{|A \cap B|}{|A \cup B|},\quad
\text{novelty} = 1 - \text{overlap}
\]

空集约定：双空 Jaccard = **1**。

### 与分类器融合

\[
\text{predictRetainScore} = 0.55 \cdot \text{novelty} + 0.45 \cdot \text{classifierImportance}
\]

结果夹紧到 \[0, 1\] 并保留四位小数。

**近期语料构造**：对每条 `MemoryRecord` 拼接 `summaryL0`、`overviewL1`、`text` 非空字段后 joined。

---

## 2. `PredictCalibrateScorer`（`memory-pipeline`）

**文件**：`reflect/predict_calibrate.py`。

对查询文本嵌入向量 \(\mathbf{v}\)，与**历史向量** \(\{\mathbf{r}_i\}\)：

\[
\text{best} = \max_i \cos(\mathbf{v}, \mathbf{r}_i),\quad
\text{novelty} = \text{clip}(1 - \text{best}, 0, 1)
\]

- 若无历史向量：返回 **1.0**（完全新颖）。
- **`similarity_floor`（默认 0.25）**：当 `best == 0`（数值未定义或正交）时用 `max(novelty, floor)` 避免过度奖励。

适用于异步批量：工人从向量索引或缓存拉取代表向量再打分。

---

## 3. 与反思触发联动

`RetainPipeline` 中：

```typescript
const threshold = 0.72;
if (importance >= threshold) {
  await store.pushOutboxEvent({ eventType: "memory.reflect.request", ... });
}
```

`importance` 即 `predictRetainScore` 输出。可按租户/命名空间配置化 `threshold` 与权重 **0.55 / 0.45**。

---

## 4. 与 `ImportancePredictor` 的关系

| 组件 | 信号类型 | 成本 |
|------|-----------|------|
| `RetentionScorer` | 词集合 Jaccard + 启发式 | 低 |
| `PredictCalibrateScorer` | 稠密向量余弦 | 一次嵌入调用 |
| `ImportancePredictor` | n-gram 覆盖率 / 信息增益代理 | 低，偏符号 |

可在管道中 **串行或加权投票**，注意归一化与重复计数。

---

## 公式卡片

```text
Jaccard novelty:  novel = 1 - |A∩B|/|A∪B|
TS blend:         score = 0.55*novel + 0.45*classifierImp
Embedding:        novel = clip(1 - max_i cos(v, r_i), 0, 1)
```
