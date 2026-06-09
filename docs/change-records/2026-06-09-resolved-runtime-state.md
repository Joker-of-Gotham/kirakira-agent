# Resolved runtime state

Date: 2026-06-09

## Request

Continue reducing runtime ecosystem drift by making the config resolver expose
the same runtime profile shape used by local, Docker, web, desktop, and MCP
surfaces.

Use the profile-driven local targets: web workbench
`http://127.0.0.1:5183`, desktop renderer `http://127.0.0.1:5174`, and runtime
gateway `ws://127.0.0.1:17373/runtime`. A listener on `127.0.0.1:5173` is
Vite's generic default and is not a Kirakira validation target.

## Root Cause

`scripts/runtime-profile.mjs` had the rich runtime source of truth, but
`@kirakira/config-resolver` still returned a static `agent.toml` runtime
section. That meant SDK/API, audit, frontend, and future orchestration callers
could inspect a resolved config while missing the actual service catalog, MCP
catalog, workbench endpoints, and profile roots that launchers use.

## Files Changed

- `packages/core/src/types/config.ts`
- `packages/config-resolver/src/resolved-state.ts`
- `packages/config-resolver/src/types.ts`
- `test/unit/config-resolver/resolved-state.test.ts`
- `docs/plane/kirakira-agent-config/05-resolved-state/README.md`

## Implementation

- Added `ResolvedRuntimeState` and related profile/service/MCP/presentation
  state types to core config types.
- Added `ResolvedConfig.runtimeState` plus `configPaths.runtimeProfiles`.
- Projected `configs/runtime/profiles.json` into config resolver output without
  duplicating service names or MCP package descriptors in resolver code.
- Included runtime state in the resolved fingerprint so changes to profile
  catalogs invalidate derived caches.
- Persisted `runtimeState` in `.kirakira/resolved-state.json` payloads.

## Source Basis

- Docker Compose profiles are the official way to adjust an application model
  for different environments and use cases.
  <https://docs.docker.com/compose/how-tos/profiles/>
- MCP hosts consume server descriptors through `mcpServers` entries with
  command/args/env-style process configuration.
  <https://modelcontextprotocol.io/docs/develop/build-server>
- Twelve-Factor configuration guidance treats environment-specific runtime
  values as deploy/config state rather than code constants.
  <https://www.12factor.net/config>

## Verification

- `pnpm.cmd --filter @kirakira/core build`
- `pnpm.cmd --filter @kirakira/config-resolver typecheck`
- `pnpm.cmd --filter @kirakira/config-resolver build`
- `pnpm.cmd exec vitest run test/unit/config-resolver/resolved-state.test.ts test/contract/config/resolved-state-schema.test.ts test/unit/runtime/profile-resolution.test.ts test/unit/scripts/container-launcher.test.ts test/unit/scripts/workbench-launcher.test.ts test/contract/runtime/runtime-profile-compose-contract.test.ts test/contract/cli/runtime-profile-command.test.ts test/contract/cli/runtime-doctor-command.test.ts`

Observed result: the targeted resolver/runtime profile parity tests passed and
the resolver package typechecked and built after rebuilding core declarations.

## Remaining Risks

- Launchers still use `scripts/runtime-profile.mjs` directly. This slice creates
  a shared resolved-state projection first; migrating runtime callers onto it
  should happen only after parity coverage is broader.
- The projection is intentionally descriptive. It does not execute readiness
  checks or start Docker/local services.
