# 2026-05-09 MCP Startup Diagnostics and Repair

## Symptom

The interactive TUI entered the MCP panel and stayed at startup, with all configured servers shown as failed:

```text
MCP Servers
Starting MCP servers...

- filesystem-core
- filesystem-search
- filesystem-git
- filesystem-patch
- filesystem-artifact
- filesystem
- memory
- github
```

The user had added npm-based MCP servers with:

```text
/mcp add @modelcontextprotocol/server-filesystem
/mcp add @modelcontextprotocol/server-memory
/mcp add @modelcontextprotocol/server-github
/mcp refresh
```

## Root Cause

There were several independent failures.

1. The stdio MCP transport had no startup timeout for the initial `initialize` JSON-RPC request. If a child process exited early or never replied, the pending request could remain unresolved and the TUI could stay on `Starting MCP servers...`.
2. Stdio child process stderr was not retained, so actionable startup errors were hidden from the TUI and CLI diagnostics.
3. `/mcp add @modelcontextprotocol/server-filesystem` generated an invalid filesystem server entry because the official filesystem MCP server requires at least one allowed directory argument. The generated entry omitted `"."`.
4. The existing `filesystem-git` entry used `uvx` and a Linux-only repository path (`/home/dev/workspace`). On this Windows host, `uvx` was not installed.
5. The local `filesystem-patch` and `filesystem-artifact` entries pointed at `dist/index.js`, but those workspace packages had not been built yet.

## Files Changed

- `.mcp.json`
- `.env.example`
- `packages/cli/bin/run.js`
- `packages/cli/src/commands/mcp/add.ts`
- `packages/cli/src/commands/mcp/tools.ts`
- `packages/cli/src/tui/App.tsx`
- `packages/cli/src/tui/ContextDrawer.tsx`
- `packages/cli/src/tui/hooks/useMcp.ts`
- `packages/cli/src/tui/types.ts`
- `packages/mcp-adapter/src/client.ts`
- `packages/mcp-adapter/src/gateway.ts`
- `packages/mcp-adapter/src/transports/stdio.ts`
- `docs/change-records/2026-05-09-mcp-startup-diagnostics.md`

## Implementation Details

The stdio transport now:

- Applies a 30 second startup timeout to the `initialize` request.
- Rejects pending requests when the MCP child process exits or emits an error.
- Captures a bounded stderr tail and includes it in transport errors.
- Stops and clears failed sessions instead of leaving them in a permanent `starting` state.

The MCP manager and gateway now:

- Mark failed servers as `unhealthy`.
- Store the last startup error per server.
- Start configured servers in parallel so one slow or broken server does not block every other server.
- Include per-server error text in the gateway summary.

The TUI now:

- Carries the server health state and startup error through `useMcp`.
- Shows `OK` or `ERR`, the health state, tool count, and a short error message in the MCP drawer.

The `mcp tools` CLI summary now prints the stored per-server startup error under unhealthy servers.

MCP configuration and add flow changes:

- `.mcp.json` now gives the user-added `filesystem` server the required `"."` allowed directory.
- `.mcp.json` replaces the Windows-incompatible `uvx mcp-server-git --repository /home/dev/workspace` entry with `npx -y @cyanheads/git-mcp-server`.
- CLI and TUI `/mcp add` now auto-add `"."` for `server-filesystem` packages.
- `packages/cli/bin/run.js` mirrors `GITHUB_TOKEN` and `GITHUB_PERSONAL_ACCESS_TOKEN` after `.env` loading so either token name works for GitHub MCP packages.
- `.env.example` documents both GitHub token variable names.

## Verification Performed

Type checking:

```powershell
pnpm.cmd --filter @kirakira/mcp-adapter typecheck
pnpm.cmd --filter @kirakira/cli typecheck
```

Both passed.

Builds:

```powershell
pnpm.cmd --filter @kirakira/mcp-adapter build
pnpm.cmd --filter @kirakira/cli build
pnpm.cmd --filter @kirakira/mcp-filesystem-patch build
pnpm.cmd --filter @kirakira/mcp-filesystem-artifact build
```

All completed successfully.

CLI add default validation:

```powershell
node packages\cli\bin\run.js mcp add @modelcontextprotocol/server-filesystem
```

Observed generated config in a temporary directory:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "."
      ],
      "env": {
        "NODE_NO_WARNINGS": "1"
      }
    }
  }
}
```

Real MCP startup verification:

```powershell
node packages\cli\bin\run.js mcp tools
node packages\cli\bin\run.js mcp test filesystem-patch
node packages\cli\bin\run.js mcp test filesystem-artifact
```

Observed result after repair:

```text
MCP Gateway - 109 tools from 8 servers

filesystem-core      healthy
filesystem-search    healthy
filesystem-git       healthy
filesystem-patch     healthy
filesystem-artifact  healthy
filesystem           healthy
memory               healthy
github               healthy
```

The two local MCP package checks returned:

```text
OK  filesystem-patch  tools=6
OK  filesystem-artifact  tools=6
```

## Notes

The GitHub MCP server can initialize and list tools without a token, but real GitHub operations still require a valid token. Fill either `GITHUB_TOKEN` or `GITHUB_PERSONAL_ACCESS_TOKEN` in `.env`.

The current `.mcp.json` intentionally keeps both `filesystem-core` and the user-added `filesystem` server. They overlap, but both are now valid. Remove one later only if duplicate filesystem tools become noisy.
