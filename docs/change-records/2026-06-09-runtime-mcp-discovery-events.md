# 2026-06-09 Runtime MCP Discovery and Event Projection

## Context

Browser and desktop clients could invoke daemon-owned MCP tools through
`mcp_call`, but they still had no typed way to discover live tool availability
or health. Direct presentation-client MCP calls also returned ack payloads
without entering the run event stream, so timeline surfaces could not explain
why a tool result appeared.

This slice follows the MCP tool boundary:

- `tools/list` is the live discovery surface for server-provided tools.
- `tools/call` is the invocation surface.
- Tool execution failures stay in tool results when the server returns
  `isError`, while protocol failures stay request errors.

References used for the implementation boundary:

- Model Context Protocol 2025-06-18 lifecycle and capability negotiation:
  https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle
- Model Context Protocol tool listing and invocation semantics:
  https://modelcontextprotocol.io/specification/2025-06-18/server/tools
- OpenTelemetry GenAI agent and tool span semantics:
  https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-agent-spans/

## Changed

- Added `RuntimeMcpListRequest`, `RuntimeMcpServerStatus`,
  `RuntimeMcpToolSummary`, and `RuntimeMcpListResult` to
  `@kirakira/runtime-contracts`.
- Added the daemon `mcp_list` client message with typed ack parsing.
- Added `DaemonMcpRuntime.listTools()`, which reports known MCP server health
  and can optionally start servers before listing their `tools/list` output.
- Wired MCP discovery through `DaemonClient`, browser gateway transport,
  desktop preload/IPC/renderer transport, and the mock frontend transport.
- Emitted `tool.call.started`, `tool.call.completed`, and `tool.call.failed`
  run events for direct `mcp_call` requests when a `runId` is present.
- Kept event persistence best-effort so a direct MCP request is not failed by
  timeline-store write problems.

## Design Notes

- MCP discovery is server-scoped and profile-driven. Clients request discovery;
  they do not hardcode server names or tool lists.
- Tool summaries intentionally preserve schemas and descriptions for future
  UI, approval, and policy projection.
- Direct `mcp_call` events use the same run timeline vocabulary as kernel tool
  calls, which keeps browser, desktop, and CLI presentation paths convergent.
- Result previews are capped and tolerate unserializable tool results.

## Validation

- `pnpm.cmd --filter @kirakira/runtime-contracts typecheck`
- `pnpm.cmd --filter @kirakira/runtime-contracts build`
- `pnpm.cmd --filter @kirakira/runtime-daemon typecheck`
- `pnpm.cmd --filter @kirakira/frontend-core typecheck`
- `pnpm.cmd --filter @kirakira/frontend-core build`
- `pnpm.cmd --filter @kirakira/frontend-app typecheck`
- `pnpm.cmd --filter @kirakira/runtime-daemon build`
- `pnpm.cmd --filter @kirakira/desktop typecheck`
- `pnpm.cmd --filter @kirakira/desktop build`
- `pnpm.cmd --filter @kirakira/frontend-app build`
- `pnpm.cmd exec vitest run test/unit/runtime-contracts/runtime-protocol-codec.test.ts test/unit/frontend-core/browser-gateway-transport.test.ts test/unit/runtime-daemon/mcp-runtime.test.ts test/unit/runtime-daemon/daemon-lifecycle-mcp-events.test.ts test/unit/desktop/runtime-ipc.test.ts test/unit/desktop/desktop-transport.test.ts`

## Remaining Work

- Render live MCP discovery and health in the web and desktop workbench.
- Route direct presentation-client MCP calls through the same gateway trust,
  audit, and OTel bridge as delegated kernel calls.
- Expand resolved MCP metadata to include auth, trust, timeout, and transport
  details without leaking secrets.
- Generate MCP launch config from resolved runtime profiles where possible.
