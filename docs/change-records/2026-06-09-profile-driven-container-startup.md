# Profile-Driven Container Startup

## Summary

`pnpm start` now reads its Docker image, compose service, runtime services,
default CLI command, source-hash inputs, workspace build target, and overlay
mounts from the `container.containerStartup` runtime profile block.

The workbench launch path also passes the resolved profile into MCP config
generation so `.env` defaults cannot rewrite `workbench-host` MCP roots back to
`/workspace` and `/app`.

## Why

The workbench launcher was already profile-driven, but the canonical container
launcher still carried duplicated topology in `scripts/kirakira.mjs`. That made
service lists, compose flags, and MCP roots prone to drift.

The current port contract is:

- web workbench: `http://127.0.0.1:5183`
- desktop renderer: `http://127.0.0.1:5174`
- browser runtime gateway: `ws://127.0.0.1:17373/runtime`

A Vite server on `5173` is not the Kirakira workbench default and should not be
used as the project validation target.

## Verification

- `test/unit/scripts/container-launcher.test.ts` covers the profile-rendered
  Docker build/up/run plan.
- `test/unit/runtime/startup-contract.test.ts` covers the startup script matrix
  and the `5183`/`5174`/`17373` workbench contract.
- `test/unit/scripts/workbench-launcher.test.ts` covers MCP root rendering from
  the already-resolved workbench profile.
- `pnpm.cmd test`
- `pnpm.cmd typecheck`
- `node --check scripts/kirakira.mjs`
- `node --check scripts/kirakira-common.mjs`
- `node --check scripts/kirakira-workbench.mjs`
- `node --check scripts/kirakira-container.mjs`
- `docker compose -f docker-compose.yml config --quiet`
- `docker compose -f docker-compose.yml -f docker-compose.ports.yml config --quiet`
- `docker compose -f docker-compose.test.yml config --quiet`

`pnpm.cmd lint` still cannot run in this workspace because package lint scripts
invoke `eslint`, but `eslint` is not currently installed.
