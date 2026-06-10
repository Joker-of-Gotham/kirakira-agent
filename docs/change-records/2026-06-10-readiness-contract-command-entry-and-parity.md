# Readiness Contract, Command Entry, and Parity Slice

Date: 2026-06-10

## Request

Continue the four-track upgrade plan by landing one integrated slice across EAM
parity, Web/Electron presentation, harness contracts, and Docker/local evidence.

## External Baseline

- MCP tools remain modeled around list/call behavior and tool-originated error
  results: https://modelcontextprotocol.io/specification/2025-11-25/server/tools
- MCP observability keeps server/tool identity, trust, and result metadata
  explicit for later OpenTelemetry mapping:
  https://opentelemetry.io/docs/specs/semconv/gen-ai/mcp/
- Electron IPC stays behind a typed preload API, aligned with Electron security
  guidance: https://www.electronjs.org/docs/latest/tutorial/security
- Full lifecycle evidence still depends on Docker Compose readiness semantics:
  https://docs.docker.com/reference/cli/docker/compose/up/
- Subagent topology follows explicit role handoff and multi-agent routing
  patterns:
  https://openai.github.io/openai-agents-js/guides/handoffs/
  https://docs.langchain.com/oss/javascript/langchain/multi-agent

## Files Changed

- `packages/runtime-contracts/src/readiness.ts`
- `packages/config-resolver/src/runtime-projection.ts`
- `packages/cli/src/runtime/*`
- `scripts/runtime-ready.mjs`
- `scripts/runtime-doctor.mjs`
- `packages/frontend-app/src/workbench.tsx`
- `packages/frontend-app/src/styles.css`
- `apps/desktop/src/main/*`
- `apps/desktop/src/renderer/*`
- `docs/upgrade/eam-behavior-parity.*`
- `docs/upgrade/eam-parity-roadmap.md`

## Implementation

- Added a canonical runtime readiness contract for daemon, browser gateway,
  presentation, topology, and workbench surface checks.
- Moved config-resolver runtime projection to consume readiness helpers instead
  of duplicating check names and fallback smoke check strings.
- Added a CLI runtime script registry serializer so ready/profile/doctor/MCP
  commands share script path and argument projection.
- Added plan-vs-live evidence fields to runtime-ready and runtime-doctor output.
- Added Electron command entry wiring through a typed preload/menu contract and
  shared workbench command palette behavior.
- Updated hydrated visual QA to exercise the command entry and fixed command
  center layout so desktop, tablet, and mobile screenshots stay within viewport.
- Updated EAM behavior parity evidence and runtime-daemon composition smoke
  assertions for subagent/research lanes.

## Validation

```powershell
pnpm.cmd --filter @kirakira/runtime-contracts typecheck
pnpm.cmd --filter @kirakira/config-resolver typecheck
pnpm.cmd --filter @kirakira/cli typecheck
pnpm.cmd --filter @kirakira/frontend-app typecheck
pnpm.cmd --filter @kirakira/web typecheck
pnpm.cmd --filter @kirakira/desktop typecheck
pnpm.cmd --filter @kirakira/web build
pnpm.cmd --filter @kirakira/desktop build
pnpm.cmd exec vitest run test/unit/runtime-contracts/readiness.test.ts test/unit/config-resolver/resolved-state.test.ts test/unit/scripts/runtime-profile-projection.test.ts
pnpm.cmd exec vitest run test/unit/cli/runtime-script-registry.test.ts test/unit/cli/runtime-ready-command.test.ts test/unit/cli/runtime-profile-command.test.ts test/unit/cli/runtime-doctor-command.test.ts test/unit/cli/runtime-mcp-config.test.ts test/contract/cli/runtime-profile-command.test.ts test/contract/cli/runtime-doctor-command.test.ts
pnpm.cmd exec vitest run test/unit/runtime/runtime-ready.test.ts test/unit/runtime/runtime-doctor.test.ts
pnpm.cmd exec vitest run test/unit/frontend-app/command-actions.test.ts test/unit/frontend-app/presentation-render-evidence.test.ts test/unit/desktop/preload.test.ts test/unit/desktop/startup-manifest.test.ts test/unit/desktop/electron-smoke.test.ts test/unit/desktop/desktop-transport.test.ts test/unit/desktop/workbench-menu.test.ts test/unit/scripts/presentation-hydrated-visual-qa.test.ts
pnpm.cmd exec vitest run test/smoke/runtime-daemon/composition-smoke.test.ts test/unit/orchestrator-kernel/task-executor.test.ts test/unit/orchestrator-kernel/subagent-contract.test.ts test/unit/orchestrator-kernel/research-event-bridge.test.ts
node scripts/runtime-ready.mjs --profile workbench-host --json
node scripts/runtime-doctor.mjs --profile workbench-host --no-probe --json
pnpm.cmd presentation:render -- --profile workbench-host
$env:VITE_KIRAKIRA_RUNTIME_MODE='mock'; node scripts/presentation-hydrated-visual-qa.mjs --gate presentation-hydrated-visual-qa --profile workbench-host --timeout-ms 180000 --skip-infra --skip-daemon --live
node scripts/eam-parity-audit.mjs --depth files
node scripts/upgrade-readiness.mjs --profile workbench-host --format json
```

## Boundary

The Docker daemon remains unavailable on this machine, so the full
Docker-backed lifecycle gate is still blocked evidence rather than passed
evidence. `.mcp.json`, `.agents/`, `reference_project/`, and `skills-lock.json`
remain outside this change.
