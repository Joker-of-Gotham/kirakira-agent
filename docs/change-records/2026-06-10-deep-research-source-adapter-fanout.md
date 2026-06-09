# Deep research source adapter fanout

Date: 2026-06-10

## Scope

- Added `composeResearchSourceAdapters` in `@kirakira/deep-research` so
  multiple adapters with the same source kind fan out deterministically instead
  of overwriting each other in the runner adapter map.
- Updated `DeepResearchRunner` to consume the composed adapter list before
  planning source-kind calls.
- Replaced daemon-local memory fanout with the shared deep-research helper so
  memory, web, file, and MCP adapters use one composition path.
- Added runner coverage proving two `web` adapters both execute while the run
  still reports one source-kind tool call.

## External references

- MCP Tools specification 2025-11-25:
  <https://modelcontextprotocol.io/specification/2025-11-25/server/tools>
- OpenTelemetry MCP semantic conventions:
  <https://opentelemetry.io/docs/specs/semconv/gen-ai/mcp/>

## Validation

```powershell
pnpm.cmd exec vitest run test/unit/deep-research/planner.test.ts test/unit/runtime-daemon/kernel-bridge-subagent.test.ts
pnpm.cmd --filter @kirakira/deep-research typecheck
pnpm.cmd --filter @kirakira/runtime-daemon typecheck
```

Remaining roadmap work after the later file-source slice:

- Concrete live adapter suites for web and MCP source kinds.
- End-to-end live research gates that run file, web, and MCP adapters through
  daemon and workbench surfaces.
