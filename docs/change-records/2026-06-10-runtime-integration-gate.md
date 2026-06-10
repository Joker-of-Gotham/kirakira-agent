# Runtime Integration Gate

Date: 2026-06-10

## Change

- Added profile-owned `integrationGates.upgrade` to
  `configs/runtime/profiles.json`.
- Added `scripts/runtime-integration-gate.mjs` as the aggregate release gate
  entrypoint for deep research live adapters, memory persistence,
  runtime-daemon composition, and web/desktop workbench presentation.
- Added the root `pnpm integration:gate` script.
- Wired `scripts/upgrade-readiness.mjs` to consume the aggregate gate under
  `gates.runtimeIntegration`.
- Wrote durable aggregate evidence to
  `docs/upgrade/gates/runtime-integration-gate.json`.

## External Constraints

- Docker Compose `up` supports the profile-owned `--wait` startup shape used by
  existing readiness plans:
  <https://docs.docker.com/reference/cli/docker/compose/up/>.
- Docker Compose pre-defined environment variables are runtime inputs, not
  constants to duplicate in scripts:
  <https://docs.docker.com/compose/how-tos/environment-variables/envvars/>.
- Electron security guidance requires the shell to keep renderer isolation and
  explicit IPC boundaries:
  <https://www.electronjs.org/docs/latest/tutorial/security>.
- Electron context isolation guidance keeps preload APIs explicit:
  <https://www.electronjs.org/docs/latest/tutorial/context-isolation>.

## Validation

```powershell
pnpm.cmd exec vitest run test/unit/scripts/runtime-integration-gate.test.ts test/unit/scripts/upgrade-readiness.test.ts
node scripts/upgrade-readiness.mjs --profile workbench-host --format json
```

## Boundary

This closes the first aggregate Docker/local release gate: existing child live
evidence is now summarized by one profile-owned artifact and command. The
single-run `KernelBridge` mechanism proof now lives in
`docs/change-records/2026-06-10-runtime-daemon-composition-smoke.md`; hydrated
browser/Electron visual QA remains a separate presentation gate.
