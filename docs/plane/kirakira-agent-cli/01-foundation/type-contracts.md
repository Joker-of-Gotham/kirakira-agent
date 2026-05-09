# Type contracts (`@kirakira/core`)

All cross-package contracts are exported from `packages/core/src/index.ts`: types, Zod schemas, path helpers, crypto helpers, and lockfile utilities.

## Skills

- **Types** — `packages/core/src/types/skill.ts` (re-exported as `export type *`).
- **Schemas** — `packages/core/src/schemas/skill.ts`: `skillFrontmatterSchema` (SKILL.md YAML frontmatter), `skillManifestSchema` (normalized manifest with `source`, `trust`, `activation`, `files`, `compat`).

## MCP

- **Types** — `packages/core/src/types/mcp.ts`.
- **Schemas** — `packages/core/src/schemas/mcp.ts`: `mcpTransportSchema` (`stdio` | `http` | `sse_legacy`), `mcpAuthSchema`, `mcpServerConfigSchema`, `mcpManifestSchema`, `mcpConfigFileSchema` (whole `.mcp.json`).

## Config

- **Types** — `packages/core/src/types/config.ts` (agent, policy, resolved config).
- **Schemas** — `packages/core/src/schemas/config.ts`: `agentTomlSchema`, `policyYamlSchema`, `localConfigSchema`.

## Session and trace

- **Session types** — `packages/core/src/types/session.ts`.
- **Trace types** — `packages/core/src/types/trace.ts` (`SpanName`, `TraceSpan`, `AuditEntry`).

## Output and exec results

- **Output types** — `packages/core/src/types/output.ts`.
- **Schemas** — `packages/core/src/schemas/output.ts`: `outputEventSchema`, `outputEventType` enum values, `execResultSchema` for `exec --json`.

## Approval

- **Types** — `packages/core/src/types/approval.ts` (`ApprovalCard`, shell/MCP/write approval payloads, session pending list).

## Plugin and registry

- **Plugin** — `packages/core/src/types/plugin.ts` (`PluginKind`, `PluginMeta`, `CommandRegistry`, detect/normalize I/O, `OutputEvent`).
- **Registry** — `packages/core/src/types/registry.ts` (search results, package meta, resolve request/result, trust entries).

## Lockfile

- **Types** — `packages/core/src/types/lock.ts`.
- **Schemas** — `packages/core/src/schemas/lock.ts`; **I/O** — `packages/core/src/lock/index.ts` (`readLockFile`, `writeLockFile`, diff helpers).

## Constants

`packages/core/src/constants.ts` defines `PATHS`, `ID_PREFIX`, `MCP_TRANSPORTS`, `SPAN_NAMES`, `OUTPUT_EVENTS`, and `SCHEMA_VERSIONS` so CLI and docs stay aligned with code.

## Utilities

- **Env expansion** — `packages/core/src/utils/env-expand.ts` (`envExpand`, `envExpandStr`), used when parsing `agent.toml` / `policy.yaml`.
- **Paths** — `packages/core/src/utils/paths.ts` (`getUserSessionsDir`, `getMcpConfigPath`, `isPathWithin`, …).
- **IDs and digests** — `packages/core/src/utils/id.ts`, `packages/core/src/utils/digest.ts`.
