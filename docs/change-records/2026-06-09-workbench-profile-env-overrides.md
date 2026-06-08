# Workbench profile env override slice

Date: 2026-06-09

## Scope

- Preserved profile-scoped environment overrides for `pnpm start:web`, `pnpm start:desktop`, and `pnpm start:daemon`.
- Kept generic root overrides from leaking container defaults into host/workbench startup.
- Passed resolved runtime env into the workbench infra compose step so dry-run plans and execution use the same profile surface.

## Source Basis

- Docker Compose supports shell and `.env` interpolation for reusable multi-environment compose files.
  <https://docs.docker.com/compose/environment-variables/>
  <https://docs.docker.com/reference/compose-file/interpolation/>
- Vite exposes `VITE_*` values through `import.meta.env`, so the workbench launcher must preserve gateway URL/token overrides when starting the web surface.
  <https://vite.dev/guide/env-and-mode.html>

## Design Decisions

- `KIRAKIRA_RUNTIME_PROFILE`, workspace roots, and MCP roots are treated as root-selection values for launchers and are stripped before resolving the workbench profile.
- Endpoint, gateway, and service port variables remain available to `resolveRuntimeProfile` because they are part of the selected profile's portable runtime surface.
- The infra compose step now receives the same rendered runtime env as daemon/web/desktop package steps.

## Verification

- `pnpm.cmd exec vitest run test/unit/scripts/workbench-launcher.test.ts test/unit/runtime/profile-resolution.test.ts test/unit/runtime/startup-contract.test.ts`
- `pnpm.cmd typecheck`
- `pnpm.cmd test`
