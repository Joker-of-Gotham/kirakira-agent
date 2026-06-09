# Runtime profile MCP catalog

Date: 2026-06-09

## Request

Remove the remaining MCP renderer hardcoding from runtime profiles so server
selection, command descriptors, and MCP root substitutions are owned by
configuration rather than `scripts/runtime-profile.mjs` literals.

Use the profile-driven local targets: web workbench
`http://127.0.0.1:5183`, desktop renderer `http://127.0.0.1:5174`, and runtime
gateway `ws://127.0.0.1:17373/runtime`. A listener on `127.0.0.1:5173` is
Vite's generic default and is not a Kirakira validation target.

## Root Cause

`renderMcpServers()` still embedded each managed MCP server name, package,
command, env block, and `/workspace` or `/app` path join in JavaScript. That
kept `.mcp.json` defaults profile-aware only for roots, not for the actual MCP
server catalog.

## Files Changed

- `configs/runtime/profiles.json`
- `Dockerfile`
- `scripts/kirakira.mjs`
- `scripts/runtime-profile.mjs`
- `test/unit/runtime/profile-resolution.test.ts`
- `test/unit/scripts/container-launcher.test.ts`
- `test/contract/cli/runtime-profile-command.test.ts`
- `docs/architecture.md`
- `docs/plane/kirakira-agent-cli/07-mcp/config.md`

## Implementation

- Added `mcpCatalog.defaultServerGroups`, `mcpCatalog.groups`, and
  `mcpCatalog.servers` to the runtime profile config.
- Added `expandMcpServerRefs()` and a generic MCP descriptor renderer that
  supports string templates, profile value references, and POSIX joins.
- Preserved existing host, workbench, and container `.mcp.json` output while
  moving server names and package commands out of the renderer.
- Kept resolved profiles associated with their source config so custom profile
  configs can render custom MCP catalogs in tests and future callers.
- Copied `configs` into the runtime image and added a profile-declared overlay
  file mount for `configs/runtime/profiles.json`, so stale-but-usable runtime
  images still read the current profile catalog when overlay scripts are
  mounted.

## Source Basis

- MCP clients configure servers through an `mcpServers` object with `command`,
  `args`, and optional `env` entries.
  <https://modelcontextprotocol.io/docs/develop/build-server>
- The MCP reference servers repository documents filesystem, git, memory, and
  GitHub-style server command examples, while warning teams to evaluate their
  own production safeguards.
  <https://github.com/modelcontextprotocol/servers>

## Verification

- `node scripts/runtime-profile.mjs mcp workbench-host`
- `node scripts/runtime-profile.mjs mcp container`
- `pnpm.cmd exec vitest run test/unit/runtime/profile-resolution.test.ts`
- `pnpm.cmd exec vitest run test/unit/scripts/container-launcher.test.ts`
- `pnpm.cmd exec vitest run test/contract/cli/runtime-profile-command.test.ts`

Observed result: the targeted profile test suite passed, workbench MCP roots
rendered as `.`, and container MCP roots rendered as `/workspace` with local
package servers under `/app`.

## Remaining Risks

- Runtime launch still depends on the configured MCP packages being installable
  or already present in the selected environment.
- The profile catalog is intentionally strict: unknown groups, unknown
  template variables, and malformed descriptor values fail at render time.
