# Workbench Readiness Supervisor

Date: 2026-06-09

## Context

The workbench launcher could render profile readiness checks, but the execution
path did not consume those checks. Web and Electron startup could therefore race
the daemon, browser gateway, or renderer process, and background process exits
were only noticed between launcher steps.

## References

- Node.js child process lifecycle and signal handling:
  https://nodejs.org/api/child_process.html
- Existing daemon process lifecycle pattern:
  `packages/runtime-daemon/src/lifecycle/process-manager.ts`
- Shared runtime readiness probes:
  `scripts/runtime-doctor.mjs`

## Files Changed

- `configs/runtime/profiles.json`
- `scripts/kirakira-workbench.mjs`
- `test/unit/scripts/workbench-launcher.test.ts`
- `README.md`
- `docs/architecture.md`
- `docs/upgrade/eam-parity-roadmap.md`

## Implementation

- Added profile-declared `waitFor` checks to the `workbench-host` web and
  desktop surfaces.
- Kept readiness targets centralized in `buildRuntimeReadinessPlan()` and
  `evaluateRuntimeReadinessPlan()`; the launcher filters by check name instead
  of rebuilding URLs or ports.
- Added `WorkbenchProcessSupervisor` fail-fast behavior so background daemon or
  renderer exits interrupt readiness waits and foreground web/Electron steps.
- Added bounded cleanup semantics: Windows uses process-tree termination for
  shell-launched pnpm descendants; POSIX paths send TERM and then KILL after a
  grace period.
- Added executor-level unit tests with fake children and fake readiness probes,
  avoiding live Vite, Electron, or Docker processes.

## Verification

- `node --check scripts/kirakira-workbench.mjs`
- `pnpm.cmd exec vitest run test/unit/scripts/workbench-launcher.test.ts test/unit/runtime/startup-contract.test.ts test/unit/desktop/main-security.test.ts test/unit/desktop/renderer-endpoint.test.ts`
- `node scripts/kirakira-workbench.mjs web --dry-run --skip-infra`
- `node scripts/kirakira-workbench.mjs desktop --dry-run --skip-infra`
- `node scripts/kirakira-workbench.mjs desktop --dry-run --skip-infra --skip-daemon`

## Remaining Risks

- Full live Docker/daemon/web/desktop startup validation still belongs in a
  slower end-to-end gate.
- Electron GUI smoke automation still needs a non-interactive harness.
