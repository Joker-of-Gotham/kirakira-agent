# 2026-06-09 Runtime Profile CLI

## Summary

Added `kirakira-agent runtime profile` as a CLI-facing profile inspection
surface backed by the existing `scripts/runtime-profile.mjs` implementation.
The CLI now exposes the same `show`, `env`, `compose-args`, `readiness`, and
`mcp` views without duplicating profile resolution, service catalog expansion,
Compose argument rendering, or endpoint derivation.

Kirakira validation remains anchored on web `http://127.0.0.1:5183`, desktop
renderer `http://127.0.0.1:5174`, and browser gateway
`ws://127.0.0.1:17373/runtime`. A listener on `127.0.0.1:5173` is not a
Kirakira validation target.

## Implementation

- Added a generic `packages/cli/src/runtime/runtime-script-command.ts` bridge
  for repo-root validation, script lookup, and Windows-safe Node script
  spawning with `process.execPath`, argv arrays, and `shell: false`.
- Refactored `kirakira-agent runtime doctor` to reuse the generic bridge.
- Added `packages/cli/src/runtime/runtime-profile-command.ts` for the small
  profile-command argument mapping layer.
- Added `packages/cli/src/commands/runtime/profile.ts`.
- Tightened `scripts/runtime-profile.mjs` CLI parsing so it supports
  `--profile`, tolerates a pnpm `--` separator, and rejects unknown extra
  arguments instead of silently ignoring them.
- Updated runtime CLI docs and README startup matrix examples.

Authoritative references used:

- oclif topic separators:
  https://oclif.io/docs/topic_separator/
- oclif pattern command discovery:
  https://oclif.io/docs/command_discovery_strategies/
- oclif arguments and flags:
  https://oclif.io/docs/args/
  https://oclif.io/docs/flags
- Node.js `child_process.spawn()` and `close` behavior:
  https://nodejs.org/api/child_process.html

## Verification

Planned commands:

```powershell
pnpm.cmd --filter @kirakira/cli build
pnpm.cmd exec vitest run test/unit/cli/runtime-script-command.test.ts test/unit/cli/runtime-doctor-command.test.ts test/unit/cli/runtime-profile-command.test.ts test/unit/runtime/profile-resolution.test.ts test/unit/runtime/startup-contract.test.ts test/contract/cli/runtime-doctor-command.test.ts test/contract/cli/runtime-profile-command.test.ts
node packages/cli/bin/run.js runtime profile env workbench-host
node packages/cli/bin/run.js runtime profile readiness workbench-host
pnpm.cmd typecheck
pnpm.cmd test
git diff --check
```
