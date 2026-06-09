# 2026-06-09 Runtime Readiness Plan

## Summary

Added a profile-rendered runtime readiness plan for container startup, host
workbench startup, desktop renderer startup, and test-host infrastructure.

The plan is derived from `configs/runtime/profiles.json`: service groups,
Compose files/profiles, daemon endpoints, and presentation endpoints all flow
from the selected runtime profile. Kirakira defaults remain web
`http://127.0.0.1:5183`, desktop renderer `http://127.0.0.1:5174`, and browser
gateway `ws://127.0.0.1:17373/runtime`.

A Vite server on `127.0.0.1:5173` is not Kirakira validation evidence.

## Implementation

- Added `buildRuntimeReadinessPlan()` in `scripts/runtime-profile.mjs`.
- Added a `pnpm runtime:profile readiness <profile>` JSON view.
- Embedded readiness plans in workbench and container startup dry-run plans.
- Kept readiness URLs sanitized so user info, password fields, query strings,
  and fragments do not appear in the readiness JSON.
- Preserved Docker Compose readiness as `docker compose ... up -d --wait`
  over profile-derived service names. This follows Docker Compose behavior for
  waiting on running or healthy services and relies on the Compose healthchecks
  already defined in the repo.

Authoritative references used:

- Docker Compose services and health dependency behavior:
  https://docs.docker.com/reference/compose-file/services/
- Docker Compose `up --wait` behavior:
  https://docs.docker.com/reference/cli/docker/compose/up/

## Verification

Planned commands:

```powershell
pnpm.cmd exec vitest run test/unit/runtime/profile-resolution.test.ts test/unit/scripts/workbench-launcher.test.ts test/unit/scripts/container-launcher.test.ts test/unit/runtime/startup-contract.test.ts test/contract/runtime/runtime-profile-compose-contract.test.ts
pnpm.cmd typecheck
pnpm.cmd test
git diff --check
```

No live browser validation should use `http://127.0.0.1:5173`. Start Kirakira
with `pnpm.cmd start:web` and validate `http://127.0.0.1:5183` instead.

## Remaining Risk

Direct package-level Vite scripts can still bypass the profile-rendered
launcher. Operational checks should name the selected runtime profile or the
explicit Kirakira port.
