# Kuzu — 嵌入式图与实现状态

源文件：`packages/memory-graph/src/kuzu/client.ts`。返回上级：[`README.md`](README.md)。

---

## 产品定位

[Kuzu](https://kuzudb.com/) 是 **嵌入式** 分析型图数据库，常以 **本地文件** 或 **进程内** 方式运行，适合：

- 开发/CI **零依赖** 图遍历测试
- **单机** 批量分析、笔记本环境

---

## 当前实现：Stub

`KuzuAdapter` 所有写路径 **`not yet implemented`**；读路径 `traverse` / `findNeighbors` 返回 **空** 图结构。

```typescript
async ensureSchema(): Promise<void> {
  throw new Error("Kuzu adapter not yet implemented");
}
```

`adapter-factory` 可切到该类，但 **Recall Graph 路由** 将得到空结果 — 仅适用于占位编译。

---

## 落地清单（实施时）

1. **DDL**：节点/关系表映射 `GraphUpsertNode.label`、`GraphUpsertEdge.type`。
2. **双时态列**：与 Neo4j 边属性对齐 `valid_at`、`invalid_at`、`created_at`、`expired_at`。
3. **traverse**：端口 `TraversalParams`（深度、边类型、`timeWindow`）。
4. **invalidateEdges**：语义对齐 `ForgetService`。

---

## 与 Neo4j 的边界

| 维度 | Neo4j | Kuzu（规划） |
|------|--------|----------------|
| GDS / Louvain | 内置 | 需离线或外部分析 |
| Cypher 兼容 | 原生 | 方言子集 |
| 多租户隔离 | `tenant_id` 过滤 | 同级策略 |
