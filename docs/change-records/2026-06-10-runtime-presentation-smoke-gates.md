# Runtime and Presentation Smoke Gates

Date: 2026-06-10

## References

- The runtime smoke gates keep Docker Compose readiness tied to service
  healthchecks, matching Docker Compose startup guidance:
  <https://docs.docker.com/compose/how-tos/startup-order/>.
- The desktop presentation contract continues to keep Electron renderer checks
  behind the existing context-isolated preload boundary documented in
  `docs/design/desktop-web-presentation-contract.md`.

## Changed

- Added a neutral runtime-daemon `activeRuntimeProfile()` helper and moved MCP,
  memory, daemon config, and lifecycle manifest composition onto the same
  selected-profile lookup.
- Forwarded the daemon deep-research event sink through `KernelBridge` so the
  daemon-owned memory research source path emits bounded runtime events through
  the real bridge.
- Added a profile-owned `presentation` smoke gate covering the web workbench,
  desktop renderer, browser gateway, and hidden Electron smoke step without
  touching the unrelated `5173` dev server.
- Added `scripts/presentation-quality-gate.mjs` as a static/profile gate for
  shared workbench tokens, a11y anchors, Electron smoke content contracts,
  artifact visual-QA hooks, and the OpenHuman-informed desktop/web boundary.

## Validation

- `pnpm.cmd exec vitest run test/unit/runtime-daemon/kernel-bridge-subagent.test.ts`
- `pnpm.cmd exec vitest run test/unit/runtime-daemon/daemon-lifecycle-health.test.ts test/unit/runtime-daemon/mcp-runtime.test.ts test/unit/runtime-daemon/memory-runtime-deps.test.ts test/unit/runtime-daemon/daemon-config.test.ts`
- `pnpm.cmd exec vitest run test/unit/scripts/workbench-smoke.test.ts test/contract/runtime/workbench-smoke-gate.test.ts test/unit/scripts/workbench-launcher.test.ts test/unit/runtime/profile-resolution.test.ts`
- `node scripts/presentation-quality-gate.mjs --profile workbench-host --format json --fail-on-issues`
- `pnpm.cmd e2e:workbench:gate -- --dry-run --skip-infra`

## Remaining Risk

- The web/desktop gate is repeatable and profile-owned, but live execution
  across daemon, web, desktop renderer, and hidden Electron still needs to run
  regularly in a slower environment.
