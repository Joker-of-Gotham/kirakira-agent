# 基础设施配置

本文档说明记忆平面测试所用的 **Docker Compose 栈**、**Testcontainers 扩展方式**、**环境变量约定** 以及在 **无 Docker 环境** 下的跳过行为与 CI 集成要点。

上级文档：[`README.md`](README.md) · Compose 文件：根目录 [`docker-compose.test.yml`](../../../../docker-compose.test.yml)。

---

## docker-compose.test.yml 服务一览

| 服务 | 镜像 | 角色 |
|------|------|------|
| **postgres** | `pgvector/pgvector:pg16` | Postgres 16 + pgvector，作为 `memory_records` / episodes / outbox 等权威库 |
| **redis** | `redis:7-alpine` | Redis 7，Streams / 缓存 / 锁的集成验证 |
| **qdrant** | `qdrant/qdrant:latest` | 向量索引集成（HTTP/gRPC 端口见下） |
| **neo4j** | `neo4j:5-community` | Neo4j 5 Community，图投影与 Cypher 路径 |
| **minio** | `minio/minio:latest` | S3 兼容对象存储（episode / checkpoint blob） |

认证与库名与 [`docker-compose.test.yml`](../../../../docker-compose.test.yml) 中 `environment` 块一致（如 Postgres `kirakira_test`/`kirakira_test`，Neo4j `neo4j/testpassword`，MinIO `minioadmin`）。

---

## 端口映射与健康检查

| 服务 | 宿主机端口 | 容器内要点 | healthcheck（摘录） |
|------|------------|------------|---------------------|
| Postgres | **5432** | `POSTGRES_DB=kirakira_test` | `pg_isready -U kirakira_test`，间隔 5s，最多 10 次重试 |
| Redis | **6379** | 默认实例 | `redis-cli ping`，间隔 3s |
| Qdrant | **6333**（HTTP）、**6334**（gRPC） | REST `/healthz` | `curl -f http://localhost:6333/healthz`，间隔 5s |
| Neo4j | **7687**（Bolt）、**7474**（HTTP） | `NEO4J_AUTH=neo4j/testpassword` | `cypher-shell ... 'RETURN 1'`，间隔 10s |
| MinIO | **9000**（S3 API）、**9001**（Console） | `server /data --console-address ":9001"` | `mc ready local`（依赖镜像内 `mc` 配置；若本地调试失败可临时 `docker compose ps` + 直连 HTTP） |

**运维提示：** CI 中应在跑集成测试前 `docker compose ... ps` 或循环探测，直到所有服务 `healthy`，避免 Vitest `globalSetup` 仅探测 Postgres 成功但其它依赖未就绪导致的偶发失败。

---

## Testcontainers 模式说明

当前仓库 **默认** 采用 **Docker Compose + TCP 探测**，原因见 [`test/helpers/memory-containers.ts`](../../../../test/helpers/memory-containers.ts) 注释：

- Compose 可由 CI agent 直接拉起，无额外 NPM 依赖。
- `globalSetup`（[`test/helpers/memory-global-setup.ts`](../../../../test/helpers/memory-global-setup.ts)）仅对 `TEST_PG_URL` 解析出的主机/端口做 **1.2s TCP connect**，置位 `__KIRAKIRA_MEMORY_PG_UP__`，供 `skipIfNoDocker()` 同步判断。

**可选替代：** 在自定义 `globalSetup` 中引入 `@testcontainers/postgresql`（及兄弟模块）按需启动容器。原则与 Compose 相同：**迁移**仍通过 `runMigrations`（`@kirakira/memory-store`）在 `beforeAll` 中执行（见 `setupMemoryPostgresHooks()`）。

记忆集成用例应继续放在 `describe.skipIf(skipIfNoDocker())` 块内，以保持「无栈即跳过」的统一语义。

---

## 环境变量

默认值定义于 [`test/helpers/memory-env.ts`](../../../../test/helpers/memory-env.ts)。

| 变量 | 默认 | 用途 |
|------|------|------|
| `TEST_PG_URL` | `postgres://kirakira_test:kirakira_test@localhost:5432/kirakira_test` | Postgres 连接串 |
| `TEST_REDIS_URL` | `redis://localhost:6379/0` | Redis |
| `TEST_QDRANT_HOST` | `localhost` | Qdrant 主机 |
| `TEST_QDRANT_PORT` | `6333` | Qdrant HTTP 端口 |
| `TEST_NEO4J_URI` | `bolt://localhost:7687` | Neo4j Bolt |
| `TEST_NEO4J_USER` | `neo4j` | Neo4j 用户 |
| `TEST_NEO4J_PASSWORD` | `testpassword` | Neo4j 密码 |
| `TEST_MINIO_ENDPOINT` | `http://localhost:9000` | MinIO S3 API |

CI 中若使用 sidecar 或不同端口，**仅需覆盖上述变量**，无需改测试源码。

### 跳过与强制集成

| 变量 / 标志 | 行为 |
|-------------|------|
| `__KIRAKIRA_MEMORY_PG_UP__` | 由 `memory-global-setup` 设置为 `1` 或 `0`；**勿在生产环境依赖此变量** |
| `KIRAKIRA_FORCE_INTEGRATION=1` | 即使探测失败也 **不跳过** 集成用例（用于容器慢启动排障；可能直连失败） |

---

## 无 Docker 时的优雅跳过

1. **globalSetup** 无法连上 `TEST_PG_URL` → `__KIRAKIRA_MEMORY_PG_UP__ !== "1"`。
2. **`skipIfNoDocker()`** 返回 true → `describe.skipIf(...)` 包裹的集成套件整体跳过。
3. **单元测试**（不依赖 `setupMemoryPostgresHooks` 的 TS/Python 用例）仍可本地全绿。

这样既保证开发者克隆仓库即可 `pnpm test` 得到有意义的绿色（大量单元），又不隐瞒「未测集成」的事实（跳过显式可见）。

---

## CI/CD 集成建议

| 实践 | 说明 |
|------|------|
| **Job 拆分** | `lint` / `unit`（无 Docker）与 `integration-memory`（Compose 后全量或 `test/integration/memory`）分 job，失败定位更快 |
| **服务就绪** | `docker compose -f docker-compose.test.yml up -d` 后 `docker compose wait` 或脚本轮询 healthcheck |
| **缓存** | pnpm store、镜像层缓存；Python job 缓存 `.venv` |
| **密钥** | 测试库使用固定弱口令即可；**禁止**复用生产凭据 |
| **并行** | 多 job 共享同一 runner 时注意端口冲突；可为每个 job 分配 `COMPOSE_PROJECT_NAME` |
| **迁移** | 集成测试依赖 `packages/memory-store` 的 SQL 迁移（`setupMemoryPostgresHooks` 内 `runMigrations`）；CI 应使用与分支一致的迁移版本 |

**产物：** 可选上传 Vitest JUnit / coverage，便于回溯记忆平面回归与契约破坏。
