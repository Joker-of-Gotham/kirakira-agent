# `agent.toml` schema

Authoritative Zod schema: **`agentTomlSchema`** in `packages/core/src/schemas/config.ts`. Parser entry: **`parseAgentToml`** in `packages/cli/src/config/agent-toml.ts` (uses `smol-toml`, `envExpand`, `ConfigError` on failure).

## Top level

| Field | Type | Notes |
|-------|------|-------|
| `schema_version` | positive int | Required |
| `workspace_name` | string | Optional label |
| `trust` | `"trusted"` \| `"untrusted"` \| `"ask"` | Workspace trust hint |

## Sections

### `model`

- `default` (string) — primary model id.
- `fallback` (optional string).

### `ui`

- `theme` (optional string)
- `vim_mode` (optional bool)
- `show_trace_ids` (optional bool)

### `output`

- `default` — `"human"` \| `"json"` \| `"jsonl"`
- `exec_default` — same enum for exec mode

### `approvals`

- `mode` — `"ask"` \| `"auto"` \| `"deny"`
- `auto_run_readonly` (bool)

### `sandbox`

- `mode` — `"container"` \| `"host"` \| `"none"`
- `network` — `"restricted"` \| `"full"` \| `"none"`

### `skills`

- `discover` — optional string array (extra discovery roots)

### `mcp`

- `config_files` — optional string array (additional `.mcp.json`-like paths)

### `compat`

Booleans toggling import readers:

- `read_claude`, `read_codex`, `read_cursor`, `read_copilot`, `read_gemini`

### `telemetry`

- `mode` — `"off"` \| `"local"` \| `"remote"`
- `otel` (bool) — enable OpenTelemetry bridge (`packages/cli/src/trace/provider.ts`)

## Defaults

`defaultAgentToml()` in `packages/cli/src/config/defaults.ts` supplies baseline objects merged in `loadConfig` (`loader.ts`) before applying file contents.

## Environment expansion

`envExpand(parsed)` mutates string leaves to substitute `$VAR` / `${VAR}` patterns (`packages/core/src/utils/env-expand.ts`).
