# Deep Research Profile MCP Targets

Date: 2026-06-10

## Change

- Added profile-owned `deepResearch.mcp` target groups and target catalog entries
  to `configs/runtime/profiles.json`.
- Projected those targets through both runtime profile paths:
  `scripts/runtime-profile.mjs` and
  `packages/config-resolver/src/runtime-projection.ts`.
- Extended runtime-daemon deep-research composition so `KernelBridge` can derive
  MCP research sources from the selected runtime profile and execute them
  through the daemon-owned MCP runtime.
- Preserved explicit `daemonDeepResearch.mcp` injection as an override for
  tests and specialized callers.
- Added coverage for selected-profile target lookup, profile projection, live
  KernelBridge stdio/http MCP research execution, tool-originated `isError`
  evidence, and transport failure propagation.

## External Constraints

- MCP Tools 2025-11-25 defines `tools/list` and `tools/call` as the live tool
  discovery and invocation protocol:
  <https://modelcontextprotocol.io/specification/2025-11-25/server/tools>.
- MCP CallToolResult requires unstructured `content`, supports
  `structuredContent`, and treats tool-originated failures as result-level
  `isError` values rather than protocol errors:
  <https://modelcontextprotocol.io/specification/2025-11-25/schema>.
- MCP client guidance keeps tool errors distinct from transport failure
  handling:
  <https://modelcontextprotocol.io/docs/develop/clients/client-best-practices#error-handling>.
- OpenTelemetry MCP semantic conventions define the `tools/call` span shape and
  MCP protocol attributes used by the daemon runtime smoke evidence:
  <https://opentelemetry.io/docs/specs/semconv/gen-ai/mcp/>.

## Validation

```powershell
pnpm.cmd exec vitest run test/unit/runtime/profile-resolution.test.ts test/unit/config-resolver/resolved-state.test.ts test/unit/runtime-daemon/deep-research-mcp-source.test.ts test/unit/deep-research/mcp.test.ts
pnpm.cmd exec vitest run test/smoke/runtime-daemon/deep-research-mcp-live-source-smoke.test.ts
```

## Boundary

This closes profile-derived MCP research target discovery and the MCP
tool-result versus transport-failure boundary for the deep-research path. It
does not claim that slower Docker/local web and Electron live gates have been
run on every surface in this slice.
