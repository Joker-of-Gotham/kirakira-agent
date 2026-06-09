# Daemon memory source fanout and readiness closure

Date: 2026-06-10

## Scope

- Added daemon deep-research memory source fanout so multiple daemon-owned
  memory sources compose as one `memory` source adapter for the orchestrator
  research executor.
- Added KernelBridge coverage for the real daemon deep-research memory array
  path, including two recall lifecycles and aggregated evidence/citation output.
- Closed the remaining EAM package behavior gap by marking the
  `orchestrator-kernel` drift row covered; remaining deep-research live adapter
  work is tracked as product-level roadmap work, not EAM package parity drift.
- Added runtime-profile projection coverage for readiness, startup, MCP config,
  and workbench endpoint defaults across `container`, `test-host`, and
  `workbench-host`.
- Added a machine-readable harness hardcoding gate proving the runtime profile
  projection, startup, readiness, and MCP config fragments do not contain the
  unrelated dev-server port `5173`.
- Centralized workbench view presentation metadata in `frontend-core` so web
  and Electron share the same view selectors, ARIA labels, and empty-state copy.

## External references

- MCP Tools specification 2025-11-25:
  <https://modelcontextprotocol.io/specification/2025-11-25/server/tools>
- OpenTelemetry MCP semantic conventions:
  <https://opentelemetry.io/docs/specs/semconv/gen-ai/mcp/>
- Electron security checklist:
  <https://electronjs.org/docs/latest/tutorial/security>
- Playwright Electron automation:
  <https://playwright.dev/docs/api/class-electron>

## Validation

```powershell
pnpm.cmd exec vitest run test/unit/runtime-daemon/kernel-bridge-subagent.test.ts test/unit/scripts/upgrade-readiness.test.ts test/unit/frontend-core/workbench-navigation.test.ts test/unit/scripts/runtime-profile-projection.test.ts
pnpm.cmd exec vitest run test/unit/scripts/runtime-profile-projection.test.ts test/unit/runtime/profile-resolution.test.ts test/unit/runtime/startup-contract.test.ts test/unit/runtime/runtime-doctor.test.ts
pnpm.cmd --filter @kirakira/runtime-daemon typecheck
pnpm.cmd --filter @kirakira/frontend-core build
pnpm.cmd --filter @kirakira/frontend-app typecheck
```

Expected readiness evidence after this slice:

- `summary.openWork = 0`
- `summary.advisoryWarnings = 0`
- `gates.harnessHardcoding.status = "pass"`
- `gates.harnessHardcoding.totalMatches = 0`
