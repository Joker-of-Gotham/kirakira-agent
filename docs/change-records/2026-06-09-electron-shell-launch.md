# Electron Shell Launch

Date: 2026-06-09

## Symptom

`pnpm start:desktop` was advertised as the desktop workbench entrypoint, but the
profile only started the daemon and the desktop renderer Vite server. The
Electron main process had to be launched out-of-band, so desktop validation could
quietly degrade into another browser-renderer check.

## Root Cause

The `workbench-host` profile modeled desktop as a single package step pointing to
`@kirakira/desktop dev:renderer`. The desktop package also lacked a dev script
for compiling the main/preload process and starting Electron from the package
`main` entry.

## Files Changed

- `apps/desktop/package.json`
- `configs/runtime/profiles.json`
- `test/unit/scripts/workbench-launcher.test.ts`
- `test/unit/runtime/startup-contract.test.ts`
- `README.md`
- `docs/architecture.md`
- `docs/upgrade/eam-parity-roadmap.md`

## Implementation

- Added `build:main`, `build:renderer`, and `dev:electron` package scripts.
- Changed the `workbench-host` desktop surface to run:
  1. Docker-published runtime infra when not skipped.
  2. Runtime daemon as a background step.
  3. Desktop renderer Vite server as a background step on `5174`.
  4. Electron shell as the foreground step.
- Repointed the root `dev:desktop` shortcut through the same profile-aware
  desktop surface with infra and daemon explicitly skipped, so local iteration
  launches the renderer and Electron shell without claiming full runtime
  readiness.
- Preserved the existing Electron security posture: context isolation, sandboxed
  renderer, no renderer Node integration, and explicit IPC sender-origin checks
  against the configured loopback renderer URL or packaged file.

## Verification

- `node scripts/kirakira-workbench.mjs desktop --dry-run --skip-infra`
  rendered daemon, desktop renderer, and desktop shell steps with gateway
  `ws://127.0.0.1:17373/runtime` and renderer `http://127.0.0.1:5174`.
- `pnpm exec vitest run test/unit/scripts/workbench-launcher.test.ts test/unit/runtime/startup-contract.test.ts test/unit/desktop/renderer-endpoint.test.ts`
  passed 17 tests.
- `pnpm --filter @kirakira/desktop typecheck` passed.
- `pnpm --filter @kirakira/desktop exec electron --version` resolved Electron
  `v42.3.3`.
- A bounded smoke launch of `@kirakira/desktop dev:electron` entered a running
  state against the local `5174` renderer before its process tree was cleaned
  up.

## Remaining Risks

- Full GUI smoke automation still needs a non-interactive Electron harness.
- Live Docker/daemon readiness should be covered by a slower end-to-end gate.
- The launcher starts background steps before waiting on readiness; add a
  ProcessManager-style supervisor and surface-aware `waitFor` gates next.
