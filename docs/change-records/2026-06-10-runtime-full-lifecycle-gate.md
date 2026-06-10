# Runtime Full Lifecycle Gate

Date: 2026-06-10

## Change

- Added `runtimeLifecycleGates.runtime-full-lifecycle` to
  `configs/runtime/profiles.json`.
- Split the fast `integrationGates.upgrade` path from the slower
  `integrationGates.full-lifecycle` path.
- Added `scripts/runtime-full-lifecycle-gate.mjs` as the top-level profile
  gate for Docker services, daemon/browser gateway, web renderer, desktop
  renderer, Electron shell, and hydrated visual QA.
- Added `e2e:runtime:full-lifecycle` to root package scripts.
- Added execution identity to `presentation-hydrated-visual-qa` evidence so
  renderer-only mock evidence cannot be reused as full daemon/gateway proof.
- Added readiness reporting for `gates.runtimeFullLifecycle`; it is actionable
  open work until a matching pass artifact exists.

## External Constraints

- Docker Compose `up --wait` is the profile-owned service readiness shape:
  <https://docs.docker.com/reference/cli/docker/compose/up/>.
- Node `child_process` is the bounded process runner surface used by the gate:
  <https://nodejs.org/api/child_process.html>.
- Electron `BrowserWindow` remains the desktop renderer/window boundary:
  <https://www.electronjs.org/docs/latest/api/browser-window>.
- MCP lifecycle guidance keeps daemon/gateway readiness tied to explicit
  initialization and capability surfaces:
  <https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle>.

## Validation

```powershell
pnpm.cmd exec vitest run test/unit/scripts/runtime-full-lifecycle-gate.test.ts test/unit/scripts/presentation-hydrated-visual-qa.test.ts test/unit/scripts/runtime-integration-gate.test.ts test/unit/scripts/upgrade-readiness.test.ts
$env:VITE_KIRAKIRA_RUNTIME_MODE='mock'; node scripts/presentation-hydrated-visual-qa.mjs --gate presentation-hydrated-visual-qa --profile workbench-host --live --timeout-ms 240000 --skip-infra --skip-daemon
node scripts/runtime-full-lifecycle-gate.mjs --gate runtime-full-lifecycle --profile workbench-host --live --timeout-ms 240000
node scripts/upgrade-readiness.mjs --profile workbench-host --format json
```

## Boundary

The full lifecycle gate ran and wrote
`docs/upgrade/gates/runtime-full-lifecycle-gate.json`, but it is not a pass.
The current status is `blocked` because `docker info` cannot connect to the
Docker daemon on this machine. This is intentionally surfaced as readiness open
work rather than being hidden behind the fast renderer-only gate.
