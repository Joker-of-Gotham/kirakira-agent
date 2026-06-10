# Runtime Ready and Doctor Plan/Live Evidence

Date: 2026-06-10

## Request

Implement the Track D Docker/local ecosystem evidence slice without requiring
Docker daemon access in tests.

## Root Cause

`runtime-ready` already rendered a plan-only profile projection, but its summary
only counted top-level startup steps. Workbench startup steps live under
`startup.surfaces`, so `workbench-host` appeared to have zero startup steps even
though daemon, web, and desktop plans were present.

`runtime-doctor --no-probe` skipped live checks correctly, but the result did
not explicitly identify the evidence as probe-disabled plan validation.

## Files Changed

- `scripts/runtime-ready.mjs`
- `scripts/runtime-doctor.mjs`
- `test/unit/runtime/runtime-ready.test.ts`
- `test/unit/runtime/runtime-doctor.test.ts`

## Implementation

- Added `startupSurfaces` to `runtime-ready` output with each surface name,
  startup step count, step names, and readiness check count.
- Changed `runtime-ready.summary.startupSteps` to include surface startup
  steps, while also exposing `topLevelStartupSteps`, `startupSurfaces`, and
  `surfaceStartupSteps`.
- Added `probeMode: "live" | "disabled"` and a `probes` descriptor to
  `runtime-doctor` results.
- Updated the text doctor report to print whether live probes are enabled or
  disabled.

## Validation

```powershell
pnpm.cmd exec vitest run test/unit/runtime/runtime-ready.test.ts test/unit/runtime/runtime-doctor.test.ts
node scripts/runtime-ready.mjs --profile workbench-host --json
node scripts/runtime-doctor.mjs --profile workbench-host --no-probe --json
```

## Boundary

This slice does not touch runtime contracts, readiness contracts, or
config-resolver. Docker compose commands remain plan evidence unless a live
launcher or live gate explicitly runs them.
