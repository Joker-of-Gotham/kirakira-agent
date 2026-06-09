# Deep Research Live Adapter Gate

Date: 2026-06-10

## Change

- Added `scripts/deep-research-live-adapters.mjs` as the reusable gate for
  deep-research file, web, and MCP source adapters.
- Added `test/smoke/deep-research/live-adapters-smoke.test.ts`, which exercises
  `DeepResearchRunner -> mcpProviderFromToolCalls -> DaemonMcpRuntime.callTool`
  across local stdio and HTTP MCP fixtures.
- Wrote durable gate evidence to
  `docs/upgrade/gates/deep-research-live-adapters.json`.
- Updated `scripts/upgrade-readiness.mjs` so readiness only passes the gate when
  the live evidence matches the current profile, required suites, unit tests,
  live tests, and checks.

## External Constraints

- MCP Tools 2025-11-25 defines live tool discovery and invocation through
  `tools/list` and `tools/call`:
  <https://modelcontextprotocol.io/specification/2025-11-25/server/tools>.
- OpenTelemetry MCP semantic conventions define the MCP tool-call span evidence
  expected from daemon-governed calls:
  <https://opentelemetry.io/docs/specs/semconv/gen-ai/mcp/>.

## Validation

```powershell
pnpm exec vitest run test/unit/scripts/deep-research-live-adapters.test.ts test/smoke/deep-research/live-adapters-smoke.test.ts
node scripts/deep-research-live-adapters.mjs --profile workbench-host --live --timeout-ms 180000
node scripts/upgrade-readiness.mjs --format json
```

## Boundary

This closes the adapter-level live gate. It does not claim full KernelBridge and
ResearchTaskExecutor live research event coverage; that remains the next
product-level deep-research mechanism gap.
