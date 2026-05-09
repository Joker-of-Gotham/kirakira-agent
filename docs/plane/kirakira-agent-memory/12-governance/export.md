# 主体数据导出（Export）

`ExportService`（`packages/memory-service/src/governance/export-service.ts`）将租户工作区下 **非墓碑** 记录导出为 **JSON** 或 **JSONL**，上传到对象存储。

返回上级：[`README.md`](README.md)。

---

## 查询范围

```typescript
await store.queryRecords({
  tenantId: req.tenantId,
  workspaceId: req.workspaceId,
  limit: 50_000,
  tombstoned: false,
});
```

---

## 路径与格式

- **URI**：`s3://{bucket}/tenants/{tenantId}/exports/{exportId}.json|.jsonl`
- **Content-Type**：`application/json` 或 `application/x-ndjson`

---

## 字段剥离 — `stripForExport`

**默认**（`includeBlobs !== true`）仅输出：

`id`, `tenantId`, `workspaceId`, `kind`, `namespace`, `summaryL0`, `createdAt`, `metadata`

**`includeBlobs: true`** 额外包含：`text`, `overviewL1`

> 长正文与概述可能含 PII — 建议结合 [`pii-redaction.md`](pii-redaction.md) 或 Policy **字段级策略**。

---

## Receipt

`exportId`, `blobUri`, `recordCount`, `totalBytes`, `exportedAt`。

---

## 合规建议

- 对象 **服务端加密**、下载 **预签名 URL**、**审计日志** 记录访问者。
- 超大租户需 **分页导出**（当前单次 `50_000` 硬上限）。
