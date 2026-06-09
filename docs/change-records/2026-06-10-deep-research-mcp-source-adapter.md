# Deep Research MCP Source Adapter

Date: 2026-06-10

## Summary

Kirakira deep-research now has a provider-neutral MCP source adapter and a
daemon composition entrypoint for configured MCP research sources.

## What changed

- Added `packages/deep-research/src/mcp.ts`.
- Exported the MCP adapter from `@kirakira/deep-research`.
- Added `deepResearch.mcp` composition in
  `packages/runtime-daemon/src/bridge/deep-research.ts`.
- Added focused tests:
  - `test/unit/deep-research/mcp.test.ts`
  - `test/unit/runtime-daemon/deep-research-mcp-source.test.ts`
- Updated `docs/upgrade/eam-behavior-parity.md` and
  `docs/upgrade/eam-behavior-parity.json`.
- Added `gates.deepResearchLiveAdapters` in `scripts/upgrade-readiness.mjs`
  so the missing live MCP research gate remains machine-visible as an advisory.

## Design notes

The adapter does not hardcode any MCP server or tool name. Callers provide a
static target list or a request-aware target resolver, plus an injected
`port.callTool()` implementation. In daemon usage that port can be backed by
`DaemonMcpRuntime.callTool()`, so policy, audit, trust, OTel, server startup,
and `tools/list` validation stay on the existing MCP governance path.

The adapter converts MCP `content`, `structuredContent`, resource links,
tool-originated `isError` results, and runtime metadata into Kirakira
`ResearchEvidence` and `ResearchCitation` records. Tool errors are preserved as
bounded low-confidence evidence by default so downstream research can surface
self-correctable failures without losing the MCP result context.

## References

- MCP Tools 2025-11-25:
  <https://modelcontextprotocol.io/specification/2025-11-25/server/tools>
- MCP Schema 2025-11-25:
  <https://modelcontextprotocol.io/specification/2025-11-25/schema>
- OpenTelemetry MCP semantic conventions:
  <https://opentelemetry.io/docs/specs/semconv/gen-ai/mcp/>

## Validation

```powershell
pnpm.cmd --filter @kirakira/deep-research typecheck
pnpm.cmd --filter @kirakira/deep-research build
pnpm.cmd --filter @kirakira/runtime-daemon typecheck
pnpm.cmd exec vitest run test/unit/deep-research/mcp.test.ts test/unit/deep-research/web.test.ts test/unit/deep-research/file.test.ts test/unit/deep-research/planner.test.ts
pnpm.cmd exec vitest run test/unit/runtime-daemon/deep-research-mcp-source.test.ts test/unit/runtime-daemon/kernel-bridge-subagent.test.ts test/unit/orchestrator-kernel/task-executor.test.ts
pnpm.cmd exec vitest run test/unit/scripts/upgrade-readiness.test.ts
node scripts\upgrade-readiness.mjs --format json
```
