# MCP authentication

Auth modes are defined in **`mcpAuthSchema`** (`packages/core/src/schemas/mcp.ts`): `none`, `bearer`, `oauth`, `env`.

## Implementations

| Mode | Module | Behavior |
|------|--------|----------|
| Bearer token | `packages/mcp-adapter/src/auth/bearer.ts` | Static `Authorization: Bearer` header |
| OAuth | `packages/mcp-adapter/src/auth/oauth.ts` | OAuth flows (device / refresh—see implementation) |
| Environment | `packages/mcp-adapter/src/auth/env.ts` | Pull secrets from env vars referenced in config |

CLI **`mcp login`** (`packages/cli/src/commands/mcp/login.ts`) should persist tokens under user paths (`PATHS.userRegistryAuth` / similar—see `constants.ts`).

## Policy interaction

`policy.yaml` `mcp.approvedServers` restricts which named servers may run with elevated auth. `allowRemoteHttp` gates non-local endpoints.

## Errors

Auth failures map to `McpConnectionError` or generic `McpError` with descriptive codes (`packages/core/src/errors.ts`) for `mcp test` (`commands/mcp/test.ts`) diagnostics.

## Redaction

Use `policy.privacy.redactEnv` to keep tokens out of exported traces; never print raw headers in JSONL (`output.artifact` events should hash sensitive payloads).
