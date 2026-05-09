# Episode 分段 — 两步对齐（Nemori 启发）

Python 侧 **`EpisodeSegmenter`** 在长文本上执行 **嵌入边界检测** + **语言学对齐**，将连续叙述切为多个 `Episode` 片段（字符区间 + 文本）。灵感来自 Nemori 类方法：先找语义断裂点，再对齐到自然句/段边界。实现：`packages/memory-pipeline/src/kirakira_memory_pipeline/segmentation/`。

返回上级：[`README.md`](README.md)。

---

## 组件关系

```mermaid
flowchart LR
  T[原始文本] --> CH[Token 窗口切块]
  CH --> BD[SemanticBoundaryDetector]
  BD --> CA[RepresentationAligner]
  CA --> EP[Episode 列表]
```

| 类 | 职责 |
|----|------|
| **`EpisodeSegmenter`** | `tiktoken` 定长窗口切块 → 调边界检测 → 对齐 → 输出 `Episode(text, start_char, end_char)`。 |
| **`SemanticBoundaryDetector`** | 相邻块嵌入余弦相似度；低于阈值且（可选）为局部最小值则记为边界。 |
| **`RepresentationAligner`** | 将字符边界吸附到段落空行或句末标点后的空白。 |

> **对比**：Node 侧 `RetainPipeline` 当前为单分段（`offsetStart: 0`, `offsetEnd: len`），完整语义分段由管道消费者在消费 `memory.fact.extract` 等事件时执行 `EpisodeSegmenter` 更合理。

---

## Step 1：Token 窗口切块

- 默认 `target_tokens = 180`，`stride_tokens = 90`（重叠窗口利于边界稳定）。
- 将 token 片解码回字符串，并在原文中 **`find`** 子串以估计字符 `span`（近似映射）。

单块短文直接返回整段为一个 `Episode`。

---

## Step 2：语义边界（`SemanticBoundaryDetector`）

对每对相邻块嵌入向量计算 **余弦相似度**：

- 默认 **`similarity_threshold = 0.55`**：相似度 **≥** 阈值视为同一语义单元；**<** 阈值为候选边界。
- **`require_local_minimum = true`**（默认）：候选处相似度须 **≤** 左邻且 **≤** 右邻，抑制噪声尖峰。

边界输出为 **块索引** `i`（表示 `i` 与 `i+1` 之间），再映射到相邻 span 的字符接缝。

---

## Step 3：表示对齐（`RepresentationAligner`）

- **`prefer_paragraphs = true`**（默认）：先按 `\n\s*\n` 切段；在落点段落内再按 `(?<=[.!?])\s+` 找句界，将边界移动到 **不超过原位置的最后一句结束处**。
- 维护单调 `cursor`，避免切段顺序倒流。

对齐后排序、去重，生成分段列表。

---

## 运算与依赖

- **嵌入**：异步 `Embedder.embed(chunk_texts)`，块数与嵌入数必须一致。
- **编码**：默认 `cl100k_base`（与 OpenAI 兼容模型常用）。

---

## 伪代码摘要

```python
chunk_texts, spans = self._chunks(text, target_tokens=180, stride_tokens=90)
boundary_chunk_idxs = await self._boundaries.boundary_indices(chunk_texts, embedder)
char_candidates = [map_to_char(i) for i in boundary_chunk_idxs]
aligned = self._aligner.align_boundaries(text, char_candidates)
cuts = [0] + sorted(aligned ∩ (0, len)) + [len(text)]
# 输出 [stripped[a:b] for each consecutive cut]
```

---

## 调参与观测

| 参数 | 效果 |
|------|------|
| 提高 `similarity_threshold` | 更少边界（粗分段）。 |
| 关闭 `require_local_minimum` | 更密边界，可能过切。 |
| 增大 `target_tokens` | 块更大，边界分辨率变粗。 |

建议在评测集上统计 **平均每段 token 数** 与 **LLM 事实抽取召回** 联合调参。
