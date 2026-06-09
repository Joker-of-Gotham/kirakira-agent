# 2026-06-09 Runtime MCP Tool Call Loop

## Context

Kirakira already exposed MCP capability metadata through the daemon manifest, but browser and desktop clients still had no shared request path for invoking daemon-owned MCP tools. That left MCP execution split between CLI/runtime internals and presentation clients.

The implementation follows the MCP `tools/call` contract: malformed or transport-level failures remain protocol errors, while tool execution failures are returned as typed tool-call results with `isError` and policy metadata.

References used for the boundary decision:

- Model Context Protocol 2025-06-18 lifecycle and capability negotiation: https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle
- Model Context Protocol tool invocation semantics: https://modelcontextprotocol.io/specification/2025-06-18/server/tools

## Changed

- Added `RuntimeMcpToolCallRequest` / `RuntimeMcpToolCallResult` to `@kirakira/runtime-contracts`.
- Added a daemon `mcp_call` client message that returns a typed ack payload.
- Added `DaemonMcpRuntime`, which registers MCP servers from `.mcp.json` and the active resolved runtime profile, enforces `McpPep`, starts the target server on demand, calls `tools/call`, and returns a policy-bearing result.
- Wired `DaemonClient`, browser gateway transport, desktop preload/IPC/renderer transport, and mock transport to the same request/result contract.
- Added tests for protocol parsing, browser gateway frames, daemon MCP allow/deny handling, and desktop IPC validation.

## Design Notes

- MCP tool failures are not collapsed into gateway protocol errors. They stay visible as tool-call results so clients can render failed tool observations without losing request correlation.
- The daemon runtime owns MCP process lifecycle and policy enforcement. Renderers only send server/tool/arguments over the existing runtime channel.
- The runtime registers profile-provided MCP servers instead of hardcoding server names into the client surface.

## Remaining Work

- Add live MCP tool discovery/health views to the web and desktop workbench.
- Feed MCP call results into the run event stream so timeline views can show direct browser/desktop tool calls.
- Replace duplicated MCP registration helpers with one profile-driven runtime dependency factory shared by delegate runtime and daemon MCP runtime.
- Generate `.mcp.json` or equivalent launch config from resolved runtime profiles where possible.
