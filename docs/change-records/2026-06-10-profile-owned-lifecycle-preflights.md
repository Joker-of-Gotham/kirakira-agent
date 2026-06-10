# Profile-Owned Lifecycle Preflights

Date: 2026-06-10

## Change

- Replaced the hardcoded Docker preflight sequence in
  `scripts/runtime-full-lifecycle-gate.mjs` with profile-declared command
  preflight checks from `configs/runtime/profiles.json`.
- Added structured lifecycle preflight evidence:
  `failedCheck`, `code`, `guidance`, `reference`, and per-check command output.
- Updated `scripts/upgrade-readiness.mjs` so the Docker / Local Ecosystem warn
  reports the actionable failed preflight instead of only saying
  `preflight=failed`.
- Kept Kirakira presentation endpoints profile-owned at web
  `http://127.0.0.1:5183/` and desktop renderer `http://127.0.0.1:5174/`.

## External Constraints

- `docker compose version` is the official Docker Compose CLI version check:
  <https://docs.docker.com/reference/cli/docker/compose/version/>.
- `docker info` is the official Docker daemon/system information check:
  <https://docs.docker.com/reference/cli/docker/system/info/>.
- `docker compose up --wait` remains the service readiness mechanism for the
  full lifecycle gate:
  <https://docs.docker.com/reference/cli/docker/compose/up/>.
- `node:child_process.spawnSync` remains the bounded synchronous process runner
  surface:
  <https://nodejs.org/api/child_process.html#child_processspawnsynccommand-args-options>.

## Validation

```powershell
pnpm.cmd exec vitest run test/unit/scripts/runtime-full-lifecycle-gate.test.ts test/unit/scripts/upgrade-readiness.test.ts
node scripts/runtime-full-lifecycle-gate.mjs --gate runtime-full-lifecycle --profile workbench-host --dry-run
node scripts/runtime-full-lifecycle-gate.mjs --gate runtime-full-lifecycle --profile workbench-host --live --timeout-ms 240000
node scripts/upgrade-readiness.mjs --profile workbench-host --format markdown --write docs/upgrade/gates/upgrade-readiness.md --fail-on-issues
```

## Boundary

The full lifecycle gate is still blocked on this machine because
`docker info` cannot reach the Docker Desktop Linux engine. The refreshed
evidence now records `failedCheck=docker-daemon`,
`code=docker-daemon-unavailable`, and guidance to start Docker Desktop or the
Docker daemon before rerunning the gate.
