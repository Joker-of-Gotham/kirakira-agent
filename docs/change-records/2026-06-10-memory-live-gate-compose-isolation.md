# Memory Live Gate and Compose Isolation

Date: 2026-06-10

## References

- Node.js documents that `.bat` and `.cmd` files on Windows need a shell path
  such as `cmd.exe`, so the memory smoke runner wraps `pnpm.cmd` through
  `cmd.exe /d /s /c` instead of spawning it directly.
  <https://nodejs.org/api/child_process.html#spawning-bat-and-cmd-files-on-windows>
- Docker Compose documents startup ordering and readiness through healthchecks,
  which matches the profile-rendered `docker compose ... up -d --wait` gate.
  <https://docs.docker.com/compose/how-tos/startup-order/>

## Changed

- Added profile-level `composeProject` support so `test-host` and `ci` use
  isolated Compose project names instead of reusing the default development
  stack volumes.
- Made `scripts/memory-persistence-smoke.mjs` write durable pass evidence to
  `docs/upgrade/gates/memory-persistence-smoke.json` after the live gate passes.
- Readiness now consumes that evidence file through the existing memory smoke
  contract instead of requiring a temporary environment variable.
- Closed the `memory-store` behavior-parity row from `partial` to `covered`.

## Validation

- `node scripts/memory-persistence-smoke.mjs --profile test-host --live --timeout-ms 240000`
- `pnpm.cmd exec vitest run test/unit/scripts/memory-persistence-smoke.test.ts test/unit/runtime/profile-resolution.test.ts test/contract/runtime/runtime-profile-compose-contract.test.ts test/unit/config-resolver/resolved-state.test.ts test/contract/config/resolved-state-schema.test.ts`
- `node scripts/upgrade-readiness.mjs --format json`

## Remaining Risk

- The isolated memory gate is now live-tested, but web and desktop presentation
  smoke gates still need regular live execution in a slower environment.
