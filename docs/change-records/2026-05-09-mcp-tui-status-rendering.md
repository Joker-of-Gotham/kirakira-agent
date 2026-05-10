# 2026-05-09 MCP TUI Status Rendering

## Symptom

The MCP drawer showed all servers healthy:

```text
MCP: 7/7 servers online, 95 tools available
```

But the main timeline still showed entries such as:

```text
✗ filesystem-core
✗ filesystem-search
✗ filesystem-git
```

This looked like MCP startup was still failing even though the gateway was healthy.

## Root Cause

This was not an MCP installation problem.

The right MCP drawer renders live `mcpHook.servers` state. The left-side lines were historical timeline entries produced by `/mcp list`.

That `/mcp list` renderer used check/cross symbols in a normal timeline string. In this Windows terminal path, the symbol rendering was fragile and made the healthy branch visually appear as a failure marker. The historical timeline entries also do not update when the live drawer state changes.

The MCP drawer also rendered `OK` and the server name as adjacent Ink `Text` nodes with a trailing space, which could collapse visually into strings like `OKfilesystem-c`.

## Files Changed

- `packages/cli/src/tui/hooks/useSlash.ts`
- `packages/cli/src/tui/ContextDrawer.tsx`
- `docs/change-records/2026-05-09-mcp-tui-status-rendering.md`

## Implementation Details

`/mcp list` now writes ASCII-only status lines:

```text
MCP OK filesystem-core
MCP ERR some-server
```

This avoids check/cross glyph ambiguity and makes the timeline output unambiguous in Windows terminals. Detailed health state remains in the live MCP drawer.

The MCP drawer now separates the status label and server name with an explicit leading space in the server-name text node:

```text
OK filesystem-core 14 tools
```

Healthy servers omit redundant `healthy` text in the drawer. Unhealthy servers still include their health state and error details.

## Operator Impact

No MCP reinstall is required.

The old `✗ filesystem-*` lines are historical timeline entries from the already-running UI process. They do not mean the currently running MCP gateway is unhealthy when the drawer says all servers are healthy.

To pick up this UI rendering fix, exit the current UI and restart through the single supported entrypoint:

```powershell
pnpm start
```

## Verification Performed

Run:

```powershell
pnpm.cmd --filter @kirakira/cli typecheck
pnpm.cmd start -- mcp list
```

Both passed.

`pnpm.cmd start -- mcp list` detected the source change, rebuilt the runtime image once, recreated `kirakirad`, waited for all dependent services to become healthy, and listed the canonical 7 MCP servers:

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

A second `pnpm.cmd start -- mcp list` run returned in 4.5 seconds and skipped Docker build after the runtime image hash matched.
