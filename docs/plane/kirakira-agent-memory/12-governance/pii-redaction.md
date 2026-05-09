# PII 分类与脱敏（PII Redaction）

两件工具：**`PiiClassifier`** 估算记录敏感度档位；**`RedactionEngine`** 对文本与 `MemoryRecord` 字段执行 **就地规则脱敏**。

源文件：`packages/memory-service/src/governance/pii-classifier.ts`、`redaction-engine.ts`。  
返回上级：[`README.md`](README.md)。

---

## `PiiClassifier.classify(text) → PiiLevel`

**档位**：`none` | `low` | `high`。

| 正则信号 | 加分 |
|----------|------|
| Email | +2 |
| SSN `\d{3}-\d{2}-\d{4}` | +3 |
| 北美电话样式 | +2 |
| `Mr/Ms/Mrs/Dr` + 两个专有名词 | +1 |

**判定**：总分 **≥3** → `high`；**≥1** → `low`；否则 `none`。

结果写入 **`MemoryRecord.piiLevel`**，并映射到向量 payload 索引 **`pii_level`**（整数枚举需与核心类型一致）。

---

## `RedactionEngine`

### `redactPlainText(s)`

顺序替换：

1. EMAIL（`gi`）
2. PHONE
3. SSN

替换占位符：**`[REDACTED]`**。

### `redactRecord(record)`

对 `text`, `summaryL0`, `overviewL1` 应用相同规则；**`redacted: true`**。

---

## 边界

- **无语境判断**：例如内部项目代号误判、漏检非美式 PII。
- **导出路径**默认 **strip** 正文；全量导出时应先 **分类 + 脱敏** 或拒出口。

---

## 与治理的配合

- Policy：`memory.read` 在高 PII 命名空间可强制 **RedactionEngine** 于 Recall 返回前执行。
- 审计：记录 **`redacted: true`** 的发布次数与主体。
