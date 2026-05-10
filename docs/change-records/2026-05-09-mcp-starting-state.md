# 2026-05-09 MCP Starting State Rendering

## Symptom

Immediately after opening the TUI, running `/mcp list` could print:

```text
MCP ERR filesystem-core
MCP ERR filesystem-search
MCP ERR filesystem-git
MCP ERR filesystem-patch
MCP ERR filesystem-artifact
MCP ERR memory
MCP ERR github
```

A second `pnpm.cmd start -- mcp list` run returned in 4.4 seconds and skipped Docker build after the runtime image hash matched.

At the same time, the right MCP drawer still showed:

```text
Starting MCP servers...
```

## Root Cause

This was not an MCP install problem.

`useMcp` initializes configured servers with:

```text
healthy=false
health=starting
ready=false
```

The `/mcp list` slash command only checked `healthy`. During startup, `healthy=false` was therefore incorrectly rendered as `ERR` even though startup had not finished yet.

## Files Changed

- `packages/cli/src/tui/hooks/useSlash.ts`
- `packages/cli/src/tui/App.tsx`
- `docs/change-records/2026-05-09-mcp-starting-state.md`

## Implementation Details

The slash-command context now receives `mcpReady`.

`/mcp status` now reports startup explicitly when MCP is not ready:

```text
MCP: starting 7 servers...
```

`/mcp list` now reports configured servers as starting while the gateway is still initializing:

```text
MCP STARTING filesystem-core
MCP STARTING filesystem-search
```

Only after `mcpReady=true` does it render:

```text
MCP OK filesystem-core
MCP ERR some-server
```

## Operator Impact

No MCP reinstall is required.

If the drawer says `Starting MCP servers...`, wait for startup to complete or use `/mcp refresh` after a network delay. `ERR` is now reserved for servers that are still unhealthy after the MCP startup cycle completes.

## Verification Performed

Run:

```powershell
pnpm.cmd --filter @kirakira/cli typecheck
pnpm.cmd start -- mcp list
pnpm.cmd start -- mcp tools
```

Both passed.

`pnpm.cmd start -- mcp list` rebuilt the runtime image after the source change and listed the canonical 7 MCP servers:

```text
MCP Servers (7):
  filesystem-core (stdio)
  filesystem-search (stdio)
  filesystem-git (stdio)
  filesystem-patch (stdio)
  filesystem-artifact (stdio)
  memory (stdio)
  github (stdio)
```

`pnpm.cmd start -- mcp tools` also passed and reported:

```text
MCP Gateway - 95 tools from 7 servers

  filesystem-core      healthy
  filesystem-search    healthy
  filesystem-git       healthy
  filesystem-patch     healthy
  filesystem-artifact  healthy
  memory               healthy
  github               healthy
```
