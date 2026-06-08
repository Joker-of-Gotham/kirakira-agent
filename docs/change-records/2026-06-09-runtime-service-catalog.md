# Runtime service catalog slice

Date: 2026-06-09

## Scope

- Added a shared runtime service catalog with reusable `memory-stack` and `runtime-stack` service groups.
- Moved container startup, workbench infra startup, and service endpoint resolution onto service-group references.
- Made catalog primary-port metadata the source for both internal container endpoints and published host/workbench endpoints.
- Preserved existing launcher output by expanding catalog groups during runtime profile resolution.
- Added contract tests that compare catalog port metadata against Compose published-port interpolation.

## Source Basis

- Docker Compose defines services as the application model unit and supports profiles for environment-specific activation.
  <https://docs.docker.com/compose/compose-application-model/>
  <https://docs.docker.com/reference/cli/docker/compose/>
- Docker Compose variable interpolation is applied to Compose files before merge, so service port env/default metadata must stay aligned with Compose interpolation.
  <https://docs.docker.com/reference/compose-file/interpolation/>
  <https://docs.docker.com/compose/environment-variables/>
- Vite exposes only `VITE_*` variables to browser code, so runtime profile rendering remains the source for web gateway env.
  <https://vite.dev/guide/env-and-mode.html>
- Electron recommends narrow preload and IPC exposure under context isolation, so desktop endpoint work remains profile-rendered rather than broad renderer-side process env access.
  <https://www.electronjs.org/docs/latest/tutorial/context-isolation>

## Design Decisions

- `serviceCatalog.groups` defines reusable stacks; profiles reference groups instead of repeating service names.
- `serviceEndpointMode: "published"` makes host and workbench profiles inherit published port env/default metadata from the catalog.
- Container profiles keep internal service ports because they do not opt into published endpoint mode.
- `serviceBindings` keeps protocol, internal host, and credential/url-shaping metadata; it no longer repeats primary port defaults.
- Resolved profiles still expose `containerStartup.runtimeServices` and `workbench.infraServices` so existing launchers remain simple consumers.

## Verification

- `pnpm.cmd exec vitest run test/unit/runtime/profile-resolution.test.ts test/unit/scripts/workbench-launcher.test.ts test/unit/scripts/container-launcher.test.ts test/contract/runtime/runtime-profile-compose-contract.test.ts test/unit/runtime/startup-contract.test.ts`
- `node scripts/runtime-profile.mjs env container`
- `node scripts/runtime-profile.mjs env workbench-host`
