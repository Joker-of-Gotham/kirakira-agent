# Resolved Workbench Surfaces

## Context

The web and desktop startup plans still depended on hard-coded surface branches in the
runtime projection layer. That made the workbench profile less authoritative than the
resolved runtime state and made future surfaces harder to add without changing code.

This slice moves the workbench surface contract into the resolved profile projection so
local, Docker, web, and Electron startup plans can all consume the same profile-owned
shape.

## Changes

- Added resolved workbench state types for packages, surface steps, wait targets, smoke
  checks, and infra services.
- Projected `workbench.defaultSurface`, `workbench.infraServiceGroups`,
  `workbench.packages`, `workbench.surfaces`, and `workbench.smokeChecks` into resolved
  runtime state.
- Reworked startup surface projection to consume `profile.workbench.surfaces` and keep
  the legacy web/desktop projection only as a compatibility fallback.
- Preserved profile-declared wait targets, including skip predicates, while filtering
  readiness checks to checks that the resolved readiness plan can actually prove.
- Expanded config-resolver coverage for `workbench-host` so the resolved state and
  startup plans assert web and desktop package refs, waits, and smoke checks.

## References

- Docker Compose documents `docker compose up --wait` as waiting for services to be
  running or healthy, which keeps readiness attached to service state rather than fixed
  sleeps: https://docs.docker.com/reference/cli/docker/compose/up/
- Electron's security checklist requires context isolation and typed preload APIs instead
  of exposing raw Electron primitives, which keeps the desktop startup path distinct from
  renderer internals: https://www.electronjs.org/docs/latest/tutorial/security
- The Twelve-Factor App config guidance treats deploy-varying configuration as external
  to code, which matches the profile-owned workbench surface model:
  https://12factor.net/config

## Validation

```powershell
pnpm.cmd --filter @kirakira/core typecheck
pnpm.cmd --filter @kirakira/core build
pnpm.cmd --filter @kirakira/config-resolver typecheck
pnpm.cmd exec vitest run test/unit/config-resolver/resolved-state.test.ts
```
