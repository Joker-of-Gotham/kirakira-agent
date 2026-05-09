# pgvector — 表、HNSW 与余弦检索

实现目录：`packages/memory-vector/src/pgvector/`。返回上级：[`README.md`](README.md)。

---

## 适配器：`PgVectorAdapter`

- **`ensureCollection`** → `ensureTable`：创建定额 `vector(dim)` 列与 HNSW 索引。
- **`search`**：仅 **稠密** 向量；忽略 `sparseIndices`/`sparseValues`。
- **`createSnapshot`**：拒绝并抛 `VectorAdapterError`（应使用数据库备份）。

---

## 表 DDL

`PgVectorTableManager.ensureTable`：

```text
id TEXT PRIMARY KEY
source_record_id TEXT NOT NULL
embedding vector({dim})
payload JSONB NOT NULL DEFAULT '{}'
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
```

表名 = 集合名，须匹配 **`MEMORY_COLLECTIONS`** 且符合安全标识符正则。

---

## HNSW 索引

```sql
CREATE INDEX ... ON "{name}" USING hnsw (embedding vector_cosine_ops);
```

**IVFFlat**：本仓库默认 **未** 创建；百万级以上可追加 `USING ivfflat` 并配合 `lists` 训练（需一次性 `ANALYZE` / 探针函数）。

---

## 余弦检索与打分

查询使用 **余弦距离运算符** `<=>`，返回分值：

\[
\text{score} = 1 - (\mathbf{e}_q <=> \mathbf{e}_{row})
\]

`score` 越大表示越相似。

---

## 过滤逻辑

| 场景 | SQL 条件 |
|------|-----------|
| 基线 | `coalesce((payload->>'tombstoned')::boolean, false) IS NOT TRUE` |
| 租户 | `payload->>'tenant_id' = $tenant` |
| 实体 | `jsonb_array_elements_text(payload->'entity_ids')` 与 `$ids` 相交 |

---

## 删除

- `DELETE ... WHERE id = ANY($1::text[])`
- `DELETE ... WHERE source_record_id = ANY(...)`
- `DELETE ... WHERE payload @> $jsonb`

---

## 与 Qdrant 的协作

- **同源镜像**：同一 `source_record_id` 可同时写 Qdrant（在线检索）与 pgvector（SQL 事务邻近查询）。
- **Recall**：若仅配置 pgvector，`SimilarityRecallRoute` 的 hybrid 分支退化，仍以双路 RRF 结构调用但稀疏侧贡献趋近于空列表行为（应在部署层统一关掉稀疏以避免无效 RPC）。

---

## 连接与生命周期

`close()` 调用 `sql.end({ timeout: 5 })`；长驻进程需在停机钩子中 **await close**。
