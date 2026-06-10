# Presentation Hydrated Visual QA Gate

Date: 2026-06-10

## Change

- Added `presentationHydratedVisualQaGates.presentation-hydrated-visual-qa`
  to `configs/runtime/profiles.json`.
- Added `scripts/presentation-hydrated-visual-qa.mjs` as the profile-owned
  live gate for hydrated web and desktop renderer visual QA.
- Added `scripts/presentation-hydrated-visual-qa-runner.mjs`, an Electron
  offscreen `BrowserWindow` runner that captures PNG screenshots, checks
  console/page failures, horizontal overflow, nonblank pixels, and shared
  Runs/Agents/Research/Systems navigation state.
- Added `test/unit/scripts/presentation-hydrated-visual-qa.test.ts` and
  extended the workbench smoke harness with an `afterReady` hook so renderer QA
  runs before startup teardown.
- Added the gate to `integrationGates.upgrade`, `scripts/upgrade-readiness.mjs`,
  and `docs/upgrade/gates/runtime-integration-gate.json`.
- Fixed the topology summary CSS so `Planned`, `Handoffs`, and `Mismatch`
  metrics no longer overflow narrow renderer columns.

## External Constraints

- Electron `BrowserWindow` is the supported main-process API for creating and
  controlling renderer windows:
  <https://www.electronjs.org/docs/latest/api/browser-window>.
- Electron `webContents` is the supported surface for loading URLs, listening
  to renderer console events, running JavaScript probes, and capturing pages:
  <https://www.electronjs.org/docs/latest/api/web-contents>.
- Electron offscreen rendering is the documented way to render and capture
  windows without showing a visible UI:
  <https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering>.
- OpenHuman's Playwright config informed the thin wrapper shape, but Kirakira
  does not copy its fallback port; Kirakira targets come from runtime profile
  projection.
- Playwright screenshot, event, and locator docs informed the archived visual
  QA contract even though this slice uses Electron to avoid adding a new
  browser-download dependency:
  <https://playwright.dev/docs/screenshots>,
  <https://playwright.dev/docs/events>,
  <https://playwright.dev/docs/locators>.

## Validation

```powershell
pnpm.cmd exec vitest run test/unit/scripts/presentation-hydrated-visual-qa.test.ts test/unit/scripts/workbench-smoke.test.ts
$env:VITE_KIRAKIRA_RUNTIME_MODE='mock'; node scripts/presentation-hydrated-visual-qa.mjs --gate presentation-hydrated-visual-qa --profile workbench-host --live --timeout-ms 240000 --skip-infra --skip-daemon
node scripts/upgrade-readiness.mjs --profile workbench-host --format json
node scripts/runtime-integration-gate.mjs --gate upgrade --dry-run
```

## Boundary

This closes the renderer-level hydrated visual QA gap for web and desktop:
there are now six archived screenshots, four core views exercised per surface,
and readiness evidence for nonblank rendering, console/page errors, and
horizontal overflow. Docker Desktop was unavailable in this environment, so the
full daemon/gateway-backed live visual run remains the next slower integration
gate.
