# 2026-06-09 Upgrade Readiness Gate

## Context

The four-track upgrade is now broad enough that ad-hoc percentage estimates are
easy to drift from the real worktree. The user also needs clear process records
while multiple agents advance EAM parity, Web/Electron presentation, harness/API
cleanup, and Docker/local ecosystem unification in parallel.

## Change

- Added `scripts/upgrade-readiness.mjs` as a read-only evidence gate.
- Added root script `pnpm upgrade:readiness`.
- Added unit coverage for argument parsing, four-track report generation, JSON
  rendering, and the Kirakira web-port invariant.

The gate derives its report from existing authoritative surfaces:

- `scripts/eam-parity-audit.mjs --depth files`
- `configs/runtime/profiles.json`
- `buildRuntimeProfileProjection()`
- root package scripts
- current web/desktop package presence

## Design Notes

- Failing checks represent hard missing surfaces or contradictory wiring.
- Warnings represent incomplete work that is still moving, such as remaining
  file-level EAM drift.
- The gate intentionally checks that the unrelated `5173` dev port is absent
  from the workbench profile projection; Kirakira web stays on `5183`.
- The gate does not replace behavioral integration tests. It is a progress and
  readiness index that points to the next missing proof.

## Verification

```powershell
pnpm.cmd exec vitest run test/unit/scripts/upgrade-readiness.test.ts
pnpm.cmd upgrade:readiness -- --format json
```
