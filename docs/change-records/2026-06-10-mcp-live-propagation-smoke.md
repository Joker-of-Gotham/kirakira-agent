# MCP Live Propagation Smoke

Date: 2026-06-10
Branch: `codex/runtime-orchestration-profile-baseline`

## Scope

This slice closes the MCP behavior-parity gap for live propagation coverage
across daemon-owned MCP transports. It does not change Kirakira runtime
endpoints: web `http://127.0.0.1:5183/`, desktop renderer
`http://127.0.0.1:5174/`, and browser gateway
`ws://127.0.0.1:17373/runtime`.

## References

- MCP 2025-11-25 tools spec: clients call `tools/list` and `tools/call`;
  tool results use `content`, optional `structuredContent`, and `isError`
  for execution errors.
- OpenTelemetry MCP semantic conventions 1.41.1: MCP client spans carry
  `mcp.method.name`; tool calls carry `gen_ai.operation.name=execute_tool`
  and `gen_ai.tool.name`; transport attributes use standard network values.

## Changes

- Added a smoke test that uses the real `McpClientManager` and
  `DaemonMcpRuntime` instead of a mocked manager.
- The smoke starts a temporary stdio MCP child process and an in-process HTTP
  MCP endpoint, then runs daemon-owned `tools/list` and `tools/call` through
  both transports.
- Added a focused unit contract assertion for the injected daemon runtime path
  so metadata projection remains covered without starting external services.
- The tests verify W3C trace context propagation through MCP `_meta`,
  trust/audit projection, policy decision metadata, audit bridge calls, and
  exported OTel span attributes for stdio `pipe` and HTTP `tcp` paths.
- Updated EAM behavior parity so the `mcp-adapter` drift row is covered
  instead of partial.

## Validation

- `pnpm.cmd exec vitest run test/smoke/runtime-daemon/mcp-live-propagation-smoke.test.ts`
- `pnpm.cmd exec vitest run test/unit/runtime-daemon/mcp-runtime.test.ts -t "smoke-tests trace, audit, and policy propagation across daemon-owned MCP transports"`

## Remaining Risks

- Future MCP transports should be added to this smoke gate when they move from
  planned support to daemon-owned live execution.
