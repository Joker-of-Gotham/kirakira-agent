# `.mcp.json` configuration

MCP configuration is validated as **`mcpConfigFileSchema`** in `packages/core/src/schemas/mcp.ts`. Parsing helpers live in **`packages/mcp-adapter/src/config-parser.ts`** (import from adapter package in apps).

## Typical structure

The schema includes:

- **`version`** or manifest metadata (see `mcpManifestSchema`)
- **`servers`**: map of **`mcpServerConfigSchema`** entries:
  - `name` (redundant key inside stored object)
  - `transport`: discriminated union (`stdio` | `http` | `sse_legacy`)
  - `auth`: `{ mode: none|bearer|oauth|env, scopes?: string[] }`
  - `tools.enabled` / `tools.disabled` lists

Exact fields evolve with schema versions—treat `mcpManifestSchema` as authoritative.

## Path resolution

`PATHS.mcpConfig` in `packages/core/src/constants.ts` is `.mcp.json`. `getMcpConfigPath` helpers (`packages/core/src/utils/paths.ts`) locate workspace files. Cursor scans both `.cursor/mcp.json` and `.mcp.json` in `compat/src/adapters/cursor.ts`.

## Profile-rendered defaults

Startup scripts create or repair managed `.mcp.json` entries through
`scripts/kirakira-common.mjs`, which calls `scripts/runtime-profile.mjs`.
The managed defaults come from `mcpCatalog` in
`configs/runtime/profiles.json`, so MCP server command descriptors, groups,
and path roots are profile data instead of launcher literals.

Use the profile-driven local targets: web workbench
`http://127.0.0.1:5183`, desktop renderer `http://127.0.0.1:5174`, and runtime
gateway `ws://127.0.0.1:17373/runtime`. A listener on `127.0.0.1:5173` is
Vite's generic default and is not a Kirakira validation target.

## agent.toml linkage

`agent.toml` `mcp.config_files` optionally adds more JSON paths merged by CLI bootstrap (schema in `packages/core/src/schemas/config.ts`).

## Validation errors

Malformed files should throw `SchemaValidationError` or `ConfigError` depending on call site; MCP add/link commands should surface stderr-friendly messages.
