# 2026-06-09 Runtime Doctor

## Summary

Added a profile-driven runtime doctor that evaluates the current readiness
state for the selected runtime profile without starting Docker services or
writing local configuration files.

The doctor consumes the same readiness plan generated from
`configs/runtime/profiles.json`, so service names, Compose arguments, daemon
socket paths, browser gateway health URLs, and web/desktop presentation URLs
remain profile-derived. Kirakira validation ports remain web
`http://127.0.0.1:5183`, desktop renderer `http://127.0.0.1:5174`, and browser
gateway `ws://127.0.0.1:17373/runtime`.

`127.0.0.1:5173` is not a Kirakira runtime doctor target.

## Implementation

- Added `scripts/runtime-doctor.mjs`.
- Added root script `pnpm runtime:doctor`.
- Added `kirakira-agent runtime doctor` as the CLI-facing wrapper around the
  same shared runtime doctor script.
- Added `runtime` to generated CLI shell completion lists.
- Added JSON and text report modes.
- Added `--no-probe` / `--plan-only` for read-only plan reports.
- Added generic HTTP, TCP, and socket probes with bounded timeouts.
- Added typed browser gateway health validation for `http-health` checks.
- Skipped container-internal service DNS targets when the selected profile is
  `container`, instead of misdiagnosing host DNS as a runtime failure.
- Kept probe results sanitized so secrets in error details are redacted.
- Aligned memory integration defaults with the `test-host` profile's published
  localhost endpoints and made Vitest global setup use the runtime doctor for
  the whole memory stack.
- Repaired `docker-compose.test.yml` Qdrant readiness so it uses the same
  dependency-free TCP strategy as base Compose, not `curl` or `wget`.

Authoritative references used:

- Node.js `AbortSignal.timeout()` for bounded fetch probes:
  https://nodejs.org/api/globals.html
- Node.js `net.Socket#setTimeout()` for bounded TCP/socket probes:
  https://nodejs.org/api/net.html
- Node.js `child_process.spawn()` close behavior for the CLI wrapper:
  https://nodejs.org/api/child_process.html
- Docker Compose `up --wait` behavior:
  https://docs.docker.com/reference/cli/docker/compose/up/
- oclif topic separators and pattern command discovery:
  https://oclif.io/docs/topic_separator/
  https://oclif.io/docs/command_discovery_strategies/

## Verification

Planned commands:

```powershell
pnpm.cmd exec vitest run test/unit/runtime/runtime-doctor.test.ts test/unit/runtime/startup-contract.test.ts
pnpm.cmd exec vitest run test/unit/runtime/memory-test-host-env.test.ts test/contract/runtime/runtime-profile-compose-contract.test.ts
pnpm.cmd --filter @kirakira/cli build
pnpm.cmd exec vitest run test/unit/cli/runtime-doctor-command.test.ts test/unit/cli/completion.test.ts test/contract/cli/runtime-doctor-command.test.ts
pnpm.cmd typecheck
pnpm.cmd test
git diff --check
```

The doctor is a diagnostic surface. Use `pnpm.cmd start:web` or `pnpm.cmd start`
to start the selected runtime path before expecting all live probes to pass.
