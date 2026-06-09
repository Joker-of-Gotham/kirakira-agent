# Behavior Parity, Electron Smoke, Memory Profile, and MCP Gateway Slice

Date: 2026-06-10

This slice used four parallel workers for the four active upgrade tracks, then
main-thread integration and verification. It does not complete the full
Kirakira upgrade goal. It advances the system from file inventory parity toward
behavior evidence, hardens desktop smoke verification, and removes another
runtime-profile bypass in memory dependencies.

## Source Baseline

- MCP schema 2025-11-25: `CallToolResult` carries `content`, optional
  `structuredContent`, and tool-originated failures should be returned with
  `isError: true` rather than protocol-level JSON-RPC errors:
  https://modelcontextprotocol.io/specification/2025-11-25/schema
- OpenTelemetry MCP semantic conventions: `tools/call` maps to
  `gen_ai.operation.name=execute_tool` with `gen_ai.tool.name` and related
  MCP/JSON-RPC attributes: https://opentelemetry.io/docs/specs/semconv/gen-ai/mcp/
- Electron security: renderer isolation relies on disabled Node integration,
  context isolation, sandboxing, and restrictive navigation/window-open policy:
  https://www.electronjs.org/docs/latest/tutorial/security
- Docker Compose readiness and env interpolation remain the ecosystem baseline:
  https://docs.docker.com/compose/how-tos/startup-order/ and
  https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/

## Changes

- Added `docs/upgrade/eam-behavior-parity.json` and
  `docs/upgrade/eam-behavior-parity.md`, then taught
  `scripts/eam-parity-audit.mjs` to merge behavior checks into file-level drift
  rows.
- Updated `scripts/upgrade-readiness.mjs` so the EAM parity warning now reports
  behavior classification status instead of an unqualified drift warning.
- Added an agent-runtime MCP gateway contract that preserves MCP `isError`
  semantics, structured content, policy metadata, and OTel-shaped tool-call
  metadata while keeping the existing direct manager path as a compatibility
  adapter.
- Changed daemon memory config construction so a resolved runtime memory
  profile cannot silently synthesize localhost Postgres, Redis, Qdrant, or Neo4j
  endpoints when profile-declared env is missing.
- Replaced desktop Electron load-only smoke with content and security
  assertions: renderer DOM markers, preload bridge methods, and absence of raw
  Node/Electron globals are checked before smoke success.
- Added a dedicated preload bundle step so Electron's sandboxed preload script
  is emitted as a CommonJS bundle after the ESM main-process build.

## Verification

- `pnpm.cmd exec vitest run test/unit/eam-parity/eam-parity-audit.test.ts test/unit/scripts/upgrade-readiness.test.ts`
- `pnpm.cmd exec vitest run test/unit/runtime-daemon/memory-runtime-deps.test.ts`
- `pnpm.cmd exec vitest run test/unit/agent-runtime/tool-executor-scope.test.ts`
- `pnpm.cmd exec vitest run test/unit/desktop/startup-manifest.test.ts test/unit/desktop/electron-smoke.test.ts test/unit/desktop/main-security.test.ts test/unit/desktop/vite.renderer.config.test.ts test/unit/scripts/workbench-smoke.test.ts`
- `pnpm.cmd --filter @kirakira/desktop typecheck`
- `pnpm.cmd --filter @kirakira/desktop build`
- `pnpm.cmd --filter @kirakira/agent-runtime typecheck`
- `pnpm.cmd --filter @kirakira/runtime-daemon typecheck`
- `node scripts/eam-parity-audit.mjs --depth files --format json --sample-size 100`
- `node scripts/upgrade-readiness.mjs --format json`
- `node scripts/kirakira-workbench.mjs web --profile workbench-host --dry-run`
- `node scripts/kirakira-workbench.mjs desktop --profile workbench-host --dry-run`
- `KIRAKIRA_WORKBENCH_ELECTRON_SMOKE=1` packaged Electron smoke passed after
  the preload bundle fix.
- `pnpm.cmd exec vitest run test/unit/agent-runtime`
- `pnpm.cmd exec vitest run test/unit/runtime-daemon`
- `git diff --check`

## Remaining Gaps

- The agent-runtime gateway contract is in place, but runtime-daemon still
  constructs the runtime executor through the compatibility direct manager path.
- Behavior parity classifies all eight drift rows, but six remain `partial`
  pending live/integration closure.
- Full live Docker/local web plus Electron smoke still needs the slower
  `workbench-host` stack, including daemon and browser gateway readiness.
- OTel exporter construction, audit bridge wiring, memory retain/reflect, and
  topology dependencies still need one profile-derived composition path.
