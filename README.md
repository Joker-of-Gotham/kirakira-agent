# Kirakira Agent Platform

> **Kirakira Agent** — 模块化 AI Agent 编排、运行时与工具平台

## 目录

- [项目概述](#项目概述)
- [架构设计](#架构设计)
- [Monorepo 包结构](#monorepo-包结构)
- [快速开始](#快速开始)
- [配置说明](#配置说明)
- [可观测性](#可观测性)
- [测试](#测试)
- [构建与发布](#构建与发布)
- [安全策略](#安全策略)
- [开发指南](#开发指南)

---

## 项目概述

Kirakira Agent Platform 是一个面向企业的 AI Agent 平台，提供模块化编排、运行时执行、记忆管理、策略治理和可观测性能力。平台基于以下设计原则构建：

- **模块化架构**：通过 monorepo 将核心能力拆分为独立可发布的包
- **开放协议优先**：采用 MCP（Model Context Protocol）作为工具协议层，Agent Skills 作为技能标准
- **企业级治理**：内置 RBAC、审批流、审计日志、数据脱敏
- **金融图谱增强**：支持图数据库（Neo4j/Kuzu）、向量检索（Qdrant/pgvector）和 RAG
- **可观测性**：OpenTelemetry 原生集成，支持分布式追踪和审计

### 技术栈

| 类别 | 技术 |
|------|------|
| 语言 | TypeScript 5.8+ / Node.js 20+ |
| 包管理 | pnpm 10+ (workspace monorepo) |
| 构建 | Turbo + tsup |
| 测试 | Vitest (TS) + pytest (Python) |
| 数据库 | PostgreSQL (pgvector), Redis, Neo4j, Qdrant, MinIO |
| 追踪 | OpenTelemetry → Tempo + ClickHouse |
| 可视化 | Grafana |

---

## 架构设计

### 分层架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Developer / Operator                      │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                    CLI 门面层 (kirakira-agent)                    │
│  init / install / start / deploy / approve / trace          │
└───────┬──────────────┬──────────────┬───────────────────────┘
        │              │              │
┌───────▼──────┐ ┌─────▼──────┐ ┌────▼──────────┐
│  Package     │ │  Workspace │ │  Skills &     │
│  Registry    │ │  Config    │ │  MCP Registry │
└──────────────┘ └────────────┘ └───────────────┘

┌─────────────────────────────────────────────────────────────┐
│                      Control Plane                          │
│  ┌─────────────┐ ┌──────────────┐ ┌──────────────────────┐ │
│  │ Orchestrator│ │  Policy      │ │  Tracing & Audit     │ │
│  │ Kernel      │ │  Engine      │ │  (OTel + AuditLedger)│ │
│  └─────────────┘ └──────────────┘ └──────────────────────┘ │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                       Data Plane                            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐  │
│  │ Agent    │ │  MCP     │ │ Memory   │ │  Model       │  │
│  │ Runtime  │ │  Adapter │ │ Service  │ │  Gateway     │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘  │
│  ┌──────────┐ ┌──────────┐                                  │
│  │ Memory   │ │  Event   │                                  │
│  │ Store    │ │  Store   │                                  │
│  └──────────┘ └──────────┘                                  │
└─────────────────────────────────────────────────────────────┘
```

### 关键流程

```
Developer → CLI → Registry (resolve packages)
           → Runtime (launch with agent.toml)
           → MCP Gateway (discover tools)
           → Memory Service (load knowledge)
           → Policy Engine (resolve RBAC)
           → Trace/Audit (open session)
           
Task Execution:
Runtime → MCP (call tools)
        → Memory (retrieve knowledge)
        → Policy (request approval if needed)
        → Model Gateway (LLM inference)
        → Audit (write trace events)
```

---

## Monorepo 包结构

项目采用 pnpm workspace monorepo 架构，所有包位于 `packages/` 目录下：

### 核心包

| 包名 | 描述 |
|------|------|
| `@kirakira/core` | 核心类型、Schema 定义、工具函数 |
| `@kirakira/cli` | 命令行界面 (基于 oclif + Ink) |
| `@kirakira/config-resolver` | 多层配置解析与合并引擎 |
| `@kirakira/compat` | 多平台兼容性适配 (Claude/Cursor/Copilot/Gemini) |

### 运行时与编排

| 包名 | 描述 |
|------|------|
| `@kirakira/agent-runtime` | ReAct 风格 Agent 执行运行时 |
| `@kirakira/orchestrator-kernel` | 任务图编排内核 |
| `@kirakira/runtime-daemon` | 本地运行时守护进程 |
| `@kirakira/skill-runtime` | Skill 执行引擎 |

### 记忆系统

| 包名 | 描述 |
|------|------|
| `@kirakira/memory-core` | 记忆领域类型、接口、Schema |
| `@kirakira/memory-service` | 记忆服务编排 (retain/recall/reflect/checkpoint) |
| `@kirakira/memory-store` | 持久化存储 (Postgres/Redis/S3) |
| `@kirakira/memory-graph` | 图数据库适配器 (Neo4j/Kuzu) |
| `@kirakira/memory-vector` | 向量存储 (Qdrant/pgvector) |

### 工具与协议

| 包名 | 描述 |
|------|------|
| `@kirakira/mcp-adapter` | MCP 协议适配器 |
| `@kirakira/mcp-filesystem-artifact` | 文件系统 Artifact MCP Server |
| `@kirakira/mcp-filesystem-patch` | 文件系统 Patch MCP Server |

### 治理与观测

| 包名 | 描述 |
|------|------|
| `@kirakira/policy-engine` | 策略引擎 (RBAC/审批/权限) |
| `@kirakira/audit-ledger` | 审计账本 (BLAKE3 + Ed25519 签名) |
| `@kirakira/event-store` | 持久化事件日志 (SQLite) |
| `@kirakira/registry-client` | 私有包注册表客户端 |

---

## 快速开始

### 前置要求

- Node.js >= 20.0.0
- pnpm >= 10.0.0
- Python 3.12+ (用于 Python 测试)

### 安装

```bash
# 克隆仓库
git clone <repository-url>
cd 260503_FG_Construct_V4

# 安装依赖
pnpm install

# 构建所有包
pnpm build
```

### 环境配置

```bash
# 复制环境变量示例
cp .env.example .env

# 编辑 .env 配置 LLM 和其他服务
# LLM_BASE_URL=http://your-llm-server:30000/v1
# LLM_API_KEY=your-api-key
# LLM_MODEL=Qwen/Qwen3.5-35B-A3B
```

### 启动开发环境

```bash
# 启动所有服务 (Postgres, Redis, Qdrant, Neo4j, MinIO)
docker compose -f docker-compose.test.yml up -d

# 启动开发模式 (watch mode)
pnpm dev
```

### 使用 CLI

```bash
# 初始化工作区
pnpm kirakira-agent init --template default

# 安装技能包
pnpm kirakira-agent install skill <skill-name>

# 启动 Agent 运行时
pnpm kirakira-agent start

# 查看追踪
pnpm kirakira-agent trace --trace-id <trace-id>
```

---

## 配置说明

### agent.toml

工作区主配置文件，定义模型、沙箱、技能、MCP 等设置：

```toml
schema_version = 1
workspace_name = "my-workspace"
trust = "ask"

[model]
default = "Qwen/Qwen3.5-35B-A3B"
fallback = "Qwen/Qwen3.5-35B-A3B"

[[model.providers]]
name = "local-vllm"
type = "vllm"
base_url = "http://localhost:30000/v1"
api_key_env = "LLM_API_KEY"

[sandbox]
mode = "container"
network = "restricted"

[telemetry]
mode = "off"  # 或 "otel" 启用 OpenTelemetry
```

### policy.yaml

安全策略配置，定义工具权限、文件系统访问规则、审批流程等：

```yaml
shell:
  hostExecution: deny
  allowlist:
    - git:*
    - pytest:*
  denylist:
    - rm:*
    - sudo:*

tools:
  allow:
    - "mcp.filesystem-core.read_file"
    - "mcp.filesystem-search.*"
  ask:
    - "mcp.filesystem-core.write_file"
    - "mcp.filesystem-git.git_commit"
  deny:
    - "mcp.filesystem-git.git_push"
```

### .mcp.json

MCP Server 配置文件，定义可用的 MCP 服务器和工具。

---

## 可观测性

### OpenTelemetry 配置

项目包含完整的 OpenTelemetry 基础设施配置：

#### 开发环境

```bash
# 启动 Jaeger (开发用)
docker compose -f configs/otel/docker-compose-dev.yaml up -d
```

#### 生产环境

```bash
# 启动 OTel Collector + Tempo + Grafana
docker compose -f configs/otel/docker-compose-prod.yaml up -d
```

### 追踪数据流

```
Agent Runtime → OTel Collector → Tempo (追踪存储)
                            → ClickHouse (长期存储)
                            → Grafana (可视化)
```

### 生产环境特性

- **数据脱敏**：自动移除敏感信息 (API Keys、Tokens)
- **尾部采样**：保留所有错误追踪，高延迟追踪 (>4s)，默认 5% 概率采样
- **审计日志**：BLAKE3 哈希 + Ed25519 签名的不可篡改审计账本

---

## 测试

### TypeScript 测试

```bash
# 运行所有测试
pnpm test

# 运行集成测试
pnpm test:integration

# 类型检查
pnpm typecheck
```

### Python 测试

```bash
# 运行 Python 测试
pytest

# 运行特定测试
pytest test/unit/memory-pipeline
```

### 测试基础设施

测试依赖以下服务 (通过 Docker Compose 启动)：

| 服务 | 端口 | 用途 |
|------|------|------|
| PostgreSQL | 5432 | 关系数据库 + pgvector |
| Redis | 6379 | 缓存 + 消息队列 |
| Qdrant | 6333/6334 | 向量数据库 |
| Neo4j | 7687/7474 | 图数据库 |
| MinIO | 9000/9001 | S3 兼容对象存储 |

```bash
# 启动测试基础设施
docker compose -f docker-compose.test.yml up -d

# 停止测试基础设施
docker compose -f docker-compose.test.yml down
```

---

## 构建与发布

### 构建

```bash
# 构建所有包
pnpm build

# 清理构建产物
pnpm clean
```

### 代码质量

```bash
# 类型检查
pnpm typecheck

# 代码检查
pnpm lint
```

### 发布流程

1. 所有包使用 SemVer 版本管理
2. 核心包 (core/runtime/cli) 双周/月度发布
3. Skills/MCP 按需发布
4. 通过私有 PyPI/npm Registry 发布

---

## 安全策略

### 文件系统安全

- 限制访问工作区目录
- 禁止访问敏感路径 (.ssh, .aws, /etc 等)
- 禁止读取 .env、*.pem、*.key 等敏感文件
- 文件读取限制 1MB，大文件通过 Artifact 处理

### 工具权限

- 只读工具：自动允许
- 写工具：需要人工审批
- 危险操作 (git push)：直接拒绝

### 审计要求

- 所有写操作需要创建快照
- 文件编辑需要 dry-run 预览
- 所有操作记录到审计账本

---

## 开发指南

### 添加新包

```bash
# 在 packages/ 目录下创建新包
mkdir packages/my-new-package
cd packages/my-new-package

# 创建 package.json
# 添加到 pnpm-workspace.yaml (已自动包含 packages/*)

# 在根 package.json 的 devDependencies 中添加引用
# 或在其他包的 dependencies 中引用 workspace:*```

### 包依赖关系

```
@kirakira/core (基础类型)
    ↓
@kirakira/config-resolver
@kirakira/compat
@kirakira/memory-core
@kirakira/event-store
    ↓
@kirakira/memory-store
@kirakira/memory-graph
@kirakira/memory-vector
@kirakira/policy-engine
@kirakira/audit-ledger
    ↓
@kirakira/memory-service
@kirakira/mcp-adapter
@kirakira/skill-runtime
@kirakira/agent-runtime
    ↓
@kirakira/orchestrator-kernel
@kirakira/runtime-daemon
    ↓
@kirakira/cli (顶层)
```

### 代码规范

- 严格 TypeScript 模式 (`strict: true`)
- 启用 `noUnusedLocals` 和 `noUnusedParameters`
- 使用 Zod 进行运行时类型验证
- 所有公共 API 提供 TypeScript 类型声明

---

## 文档

- [架构设计文档](docs/architecture.md) - 详细架构研究报告
- [configs/otel/](configs/otel/) - OpenTelemetry 配置
- [policies/](policies/) - 安全策略配置
- [test/](test/) - 测试套件

---

## License

MIT
