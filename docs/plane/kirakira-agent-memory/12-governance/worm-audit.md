# WORM、法务保全与审计链

本文描述 **不可篡改对象留存**、**法务保全（legal hold）** 与 **审计证据链** 在与 Memory 平面衔接时的要点。对象路径与 bucket 策略详见 [`../08-store-layer/blob.md`](../08-store-layer/blob.md)。

返回上级：[`README.md`](README.md)。

---

## WORM 元数据

`artifact_meta`（Postgres 迁移 `004_artifacts.sql`）含 **`worm BOOLEAN`**。

| 模式 | 行为摘要 |
|------|-----------|
| **Compliance** | 保留期内 **不可提前删除**（对象存储 **COMPLIANCE** Object Lock） |
| **Governance** | 保留期后特权可调整（**GOVERNANCE** lock）；适合运营弹性 |

**版本化 bucket** 与 **MFA Delete** 为常见配套控制。

---

## 法务保全（Legal hold）

Hold **阻止** `ForgetService` 删除关联 blob 与记录；实现上应在 **Policy 门**或 `tombstoneRecords` 前查询 **hold 表 / 法务标签**。

与 **WORM** 可同时生效：hold 解除后仍可能受 **保留期**约束。

---

## 审计链（WORM Audit）

推荐 **追加-only** 审计存储其一：

1. **表**：`audit_events`（hash-chained：`prev_hash`, `payload_hash`）。
2. **WORM bucket**：每行 JSON + 链式 HMAC。

应记录：`forget`、`export`、`checkpoint.restore`、**信念矛盾 tombstone**（胜者/败者 id、reason）。

---

## `ForgetService` 与删除作业

`createDeletionJob` 触发 **异步物理删除**；工人必须 **复查 WORM/hold**，失败转入 **人工队列**而非强行 `DELETE`。

---

## 检查清单

| 项 | 说明 |
|----|------|
| Object Lock | bucket 级开启；测试期验证拒绝提前删 |
| IAM | 分离写入者与法务管理员角色 |
| 监控 | export / forget / lock 告警与 SIEM 对接 |
| DSAR | 导出来源与目的日志留存 |
