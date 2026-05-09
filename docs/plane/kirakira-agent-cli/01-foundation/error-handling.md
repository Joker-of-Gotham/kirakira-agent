# Error hierarchy

Application errors derive from **`EamError`** in `packages/core/src/errors.ts`. Each subclass sets a stable `code` string and a human-readable message. Callers in `@kirakira/cli`, `@kirakira/mcp-adapter`, and `@kirakira/skill-runtime` should throw or wrap these types so policy and telemetry can classify failures.

## Base

- **`EamError`** — `name = "EamError"`; arbitrary `code` + `message`; optional `ErrorOptions` `cause`.

## Configuration

- **`ConfigError`** — `code: "CONFIG_ERROR"` — generic agent/policy/local config problems.
- **`ConfigNotFoundError`** — `CONFIG_NOT_FOUND` — missing file path.
- **`SchemaValidationError`** — `SCHEMA_VALIDATION` — carries `issues: unknown[]` for Zod or schema diagnostics.

## Skills

- **`SkillError`** — abstract base with customizable `code`.
- **`SkillNotFoundError`** — `SKILL_NOT_FOUND`.
- **`SkillValidationError`** — `SKILL_VALIDATION` — named skill failed validation.

## MCP

- **`McpError`** — abstract base for transport/protocol issues.
- **`McpConnectionError`** — `MCP_CONNECTION` — named server + reason.
- **`McpTimeoutError`** — `MCP_TIMEOUT` — server + timeout ms.

## Registry and lockfile

- **`RegistryError`** — `REGISTRY_ERROR` — HTTP/registry failures.
- **`LockfileError`** — `LOCKFILE_ERROR` — lock format or consistency problems (`packages/core/src/lock/index.ts` consumers).

## Approvals and security

- **`ApprovalDeniedError`** — `APPROVAL_DENIED` — policy blocked an action string.
- **`SecurityError`** — base for security policy violations.
- **`PathTraversalError`** — `PATH_TRAVERSAL` — unsafe path (`SecurityError`).

## Usage in CLI config parsing

`packages/cli/src/config/agent-toml.ts` and `policy-yaml.ts` translate read/parse failures into **`ConfigError`** with contextual messages, after **`envExpand`** from `@kirakira/core` runs on parsed objects.
