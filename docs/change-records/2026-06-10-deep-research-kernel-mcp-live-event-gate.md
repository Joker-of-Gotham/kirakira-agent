# Deep Research Kernel MCP Live Event Gate

Date: 2026-06-10

## Change

- Added `test/smoke/runtime-daemon/deep-research-mcp-live-source-smoke.test.ts`.
- The smoke submits a `KernelBridge` run with a research node and live local
  stdio/http MCP fixture servers.
- The path under test is
  `KernelBridge -> OrchestratorKernel -> ResearchTaskExecutor -> DeepResearchRunner -> mcpProviderFromToolCalls -> DaemonMcpRuntime.callTool`.
- The live gate now asserts research source, citation, task, and run completion
  events rather than only adapter-returned evidence.
- Extracted the local live MCP fixture into
  `test/helpers/deep-research-live-mcp.ts` so adapter and KernelBridge smoke
  tests share the same stdio/http MCP servers, policy decision, and OTel span
  recorder setup.
- Expanded `scripts/deep-research-live-adapters.mjs` so durable evidence
  includes both adapter transport smoke and KernelBridge research event smoke.

## External Constraints

- MCP Tools 2025-11-25 defines `tools/list` and `tools/call` as the live server
  tool discovery and invocation protocol:
  <https://modelcontextprotocol.io/specification/2025-11-25/server/tools>.
- MCP CallToolResult supports structured tool output and `isError` tool-result
  semantics:
  <https://modelcontextprotocol.io/specification/2025-11-25/schema>.
- OpenTelemetry MCP semantic conventions define MCP tool-call span attributes
  used by the daemon runtime evidence:
  <https://opentelemetry.io/docs/specs/semconv/gen-ai/mcp/>.

## Validation

```powershell
pnpm exec vitest run test/smoke/deep-research/live-adapters-smoke.test.ts test/smoke/runtime-daemon/deep-research-mcp-live-source-smoke.test.ts
node scripts/deep-research-live-adapters.mjs --profile workbench-host --live --timeout-ms 180000
node scripts/upgrade-readiness.mjs --format json
```

## Boundary

This closes the successful local live MCP research event path through
KernelBridge. It does not claim external MCP service coverage, profile-driven
MCP research target discovery, or live failure-semantics coverage for transport
errors and tool-originated `isError` results.
