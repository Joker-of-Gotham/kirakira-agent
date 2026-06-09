# Workbench Live Smoke Gate

Date: 2026-06-09

## Context

The workbench launcher had profile-derived plans, readiness checks, and
background process supervision, but there was no official bounded command for a
slower Docker/daemon/web startup smoke. Ad hoc `pnpm start:web` runs were too
easy to confuse with unrelated Vite servers and did not provide a CI-friendly
opt-in gate.

## References

- Runtime profile and readiness contract:
  `scripts/runtime-profile.mjs`
- Workbench launcher and supervisor:
  `scripts/kirakira-workbench.mjs`
- Existing startup contract:
  `test/unit/runtime/startup-contract.test.ts`

## Files Changed

- `scripts/kirakira-workbench-smoke.mjs`
- `package.json`
- `test/unit/scripts/workbench-smoke.test.ts`
- `test/e2e/workbench/workbench-host-live.test.ts`
- `test/unit/runtime/startup-contract.test.ts`
- `README.md`
- `docs/architecture.md`
- `docs/upgrade/eam-parity-roadmap.md`

## Implementation

- Added `pnpm e2e:workbench` as the canonical smoke entrypoint.
- Kept live startup opt-in: the command exits after printing the resolved smoke
  plan unless `KIRAKIRA_LIVE_E2E=1` or `--live` is provided.
- Reused `profileFromOptions()`, `buildWorkbenchPlan()`, `runWorkbenchPlan()`,
  and `waitForReadinessChecks()` instead of rebuilding ports, URLs, or Compose
  arguments.
- Runs foreground web/Electron steps as supervised background smoke processes,
  waits for profile-rendered readiness checks such as `presentation:web`, then
  tears the process tree down.
- Added a skipped-by-default E2E test that exercises the official live command
  shape when `KIRAKIRA_LIVE_E2E=1`.

## Verification

- `node --check scripts/kirakira-workbench-smoke.mjs`
- `pnpm.cmd exec vitest run test/unit/scripts/workbench-smoke.test.ts test/unit/scripts/workbench-launcher.test.ts test/unit/runtime/startup-contract.test.ts`
- `pnpm.cmd e2e:workbench -- --profile workbench-host --surface web --timeout-ms 120000 --dry-run`

## Remaining Risks

- The live gate still needs to be executed periodically in an environment where
  Docker services, the daemon, and Vite can run for the full timeout.
- Desktop GUI smoke still needs a non-interactive Electron window assertion.
