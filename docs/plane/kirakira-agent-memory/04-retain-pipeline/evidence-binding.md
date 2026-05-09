# 证据绑定规范 — `evidenceIds` 与分段

**证据绑定**将原子 **Fact** 记录锚定到产生它的 **Episode 分段**，保证后续召回、合规导出与反思时能回溯原文区间。核心实现：`packages/memory-service/src/retain/evidence-binder.ts`。

返回上级：[`README.md`](README.md)。

---

## 数据模型关系

```mermaid
flowchart LR
  EP[Episode]
  SEG[EpisodeSegment id = segmentId]
  F[MemoryRecord kind=fact]
  EP --> SEG
  SEG -->|evidenceIds[0]| F
```

- **Episode** 存全文 blob URI；**Segment** 存局部 `offsetStart`/`offsetEnd` 与预览 `text`（最多 16KiB）。
- **Fact** 的 **`evidenceIds`** 在当前实现中为 **`[segment.id]`** — 即 **分段主键 UUID**，而非 Episode ID。

---

## `EvidenceBinder.bindFacts` 行为

输入 `EvidenceBindingInput`：

| 字段 | 用途 |
|------|------|
| `segment` | 提供 `id` 作为所有事实的共同证据键。 |
| `extractedFacts` | `{ text, confidence? }[]`。 |
| `tenantId` / `workspaceId` / `namespace` | 与父 Episode 一致。 |
| `retentionClass` / `piiLevel` / `actorId` | 透传到 `MemoryRecord`。 |

每条生成 `MemoryRecord`：

| 属性 | 值 |
|------|-----|
| `kind` | `"fact"` |
| `text` | 事实全文 |
| `summaryL0` | `text` 截断 160 字符 |
| `metadata.sourceEpisodeId` | Episode UUID |
| `metadata.sourceSegmentId` | 与 `evidenceIds[0]` 相同 |
| `evidenceIds` | `[segment.id]` |
| `confidence` | 候选提供或默认 **0.7** |

---

## 设计不变量

1. **可解析性**：由 `sourceEpisodeId` + 分段 offset 可定位 blob 内子串（需 Episode 仓库提供按 offset 读取）。
2. **多对一**：同一分段可绑定多条 Fact；一条 Fact 当前仅绑定**一个**分段 ID（数组预留扩展）。
3. **与 Outbox 顺序**：先插 Episode/segment，再绑事实，最后 `memory.index.materialize`，保证物化工人可读到完整行。

---

## 查询与召回注意

- 向量/图索引的 `source_record_id` 指向 **MemoryRecord.id**，不是 `segment.id`。
- 解释追溯：`RetrievalTrace` 可在 L3 通过 `metadata.sourceSegmentId` 串联证据（见 [`../07-context-filesystem/format-spec.md`](../07-context-filesystem/format-spec.md)）。

---

## 示例（概念）

```json
{
  "id": "fact-uuid-1",
  "kind": "fact",
  "evidenceIds": ["segment-uuid-abc"],
  "metadata": {
    "sourceEpisodeId": "episode-uuid",
    "sourceSegmentId": "segment-uuid-abc"
  }
}
```
