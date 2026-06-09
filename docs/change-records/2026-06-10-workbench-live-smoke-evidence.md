# Workbench Live Smoke Evidence

Date: 2026-06-10

## Summary

Added durable result evidence support to the workbench smoke harness. The
profile-owned presentation smoke gate can now read or write a JSON result file
after a successful live run, so readiness tooling can later distinguish "not
run" from "previously passed" without launching Docker, web, or Electron.

## Changed

- `scripts/kirakira-workbench-smoke.mjs` accepts `--result`,
  `--write-result`, and `--no-write-result`.
- Dry-run and skipped reports now include `schemaVersion`, `status`,
  `evidence.resultPath`, and a `liveGate` summary.
- Live runs preflight the profile-owned daemon and presentation target ports
  before starting processes, so stale Kirakira web/desktop renderer servers are
  reported as explicit target conflicts instead of surfacing later as Vite port
  failures.
- Live success writes pass evidence for the selected profile, gate, checks,
  surfaces, targets, and command.
- The default evidence path is
  `docs/upgrade/gates/workbench-presentation-smoke.json`.

## Validation

- `pnpm.cmd exec vitest run test/unit/scripts/workbench-smoke.test.ts test/contract/runtime/workbench-smoke-gate.test.ts`
- `node scripts\kirakira-workbench-smoke.mjs --dry-run --profile workbench-host --gate presentation --skip-infra --no-write-result`
- `pnpm.cmd e2e:workbench:live -- --timeout-ms 180000`

## Remaining Risk

The gate is now proven locally. The remaining runtime-daemon work is the
profile-composition deduplication called out in
`docs/upgrade/eam-behavior-parity.md`.
