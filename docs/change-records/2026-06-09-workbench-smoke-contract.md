# Workbench Smoke Contract

Date: 2026-06-09

## Context

The workbench launcher and the smoke entrypoint both consumed profile-derived
surface plans, but the desktop Electron smoke assertion still lived in the
smoke wrapper as a local surface/step branch. That made launcher dry-run smoke
plans differ from the live e2e smoke path.

## Files Changed

- `scripts/kirakira-workbench.mjs`
- `scripts/kirakira-workbench-smoke.mjs`
- `test/unit/scripts/workbench-launcher.test.ts`
- `test/unit/scripts/workbench-smoke.test.ts`
- `test/contract/runtime/workbench-smoke-gate.test.ts`
- `docs/architecture.md`
- `docs/upgrade/eam-parity-roadmap.md`

## Implementation

- Added a launcher-owned `resolveWorkbenchSmokeContract()` that returns the
  surface readiness checks and any smoke step overrides.
- Moved the desktop Electron hidden-window assertion into
  `buildWorkbenchSmokePlan()` so launcher smoke dry-run and live e2e smoke use
  the same contract.
- Removed the duplicate desktop override branch from
  `scripts/kirakira-workbench-smoke.mjs`; it now only resolves profile, live
  opt-in, timeout defaults, and execution.
- Shared a small readiness wait helper between normal launcher execution and
  smoke execution to keep step-level `waitFor` behavior identical.

## Verification

- `node --check scripts/kirakira-workbench.mjs`
- `node --check scripts/kirakira-workbench-smoke.mjs`
- `pnpm.cmd exec vitest run test/unit/scripts/workbench-launcher.test.ts test/unit/scripts/workbench-smoke.test.ts test/contract/runtime/workbench-smoke-gate.test.ts test/contract/runtime/runtime-profile-compose-contract.test.ts`
- `pnpm.cmd e2e:workbench -- --profile workbench-host --surface web --timeout-ms 120000 --dry-run`
- `pnpm.cmd e2e:workbench -- --profile workbench-host --surface desktop --timeout-ms 120000 --dry-run`

## Remaining Risks

- Live Docker, daemon, web, and Electron smoke still require an opt-in slower
  environment run.
- The desktop smoke step override is centralized in the launcher, but it is not
  yet declarative runtime profile data because this slice stayed inside the
  allowed script/test/doc scope.
