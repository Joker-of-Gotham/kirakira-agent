# Runtime Endpoint Canonicalization

## Summary

Runtime service and presentation endpoints now resolve through
`configs/runtime/profiles.json` instead of repeated full URL literals.

This slice adds:

- structured `serviceBindings` and per-profile `serviceEndpoints`
- env-aware rendering for service URLs, browser gateway URLs, and workbench
  web/desktop URLs
- Compose published-port interpolation using the same `KIRAKIRA_*` env names
- `.env.example` defaults that declare primitive knobs instead of duplicating
  generated service URLs
- contract tests that compare profile-rendered URLs against Compose port and
  credential interpolation

## Why

The web workbench must stay on Kirakira's canonical `5183` port, the desktop
renderer on `5174`, and the browser gateway on `17373`. Vite's default dev
port is `5173`, so the profile and Vite config must explicitly route away from
that default and fail rather than silently moving to another port.

The Docker/host split also needed a sharper boundary: host published port
overrides must affect host/workbench URLs, but must not leak into container
internal service URLs such as `postgres:5432`.

## References

- Docker Compose interpolation documentation:
  https://docs.docker.com/reference/compose-file/interpolation/
- Vite server options documentation:
  https://vite.dev/config/server-options.html

## Verification

- `node scripts/runtime-profile.mjs env workbench-host`
- `node scripts/runtime-profile.mjs env test-host`
- `node scripts/kirakira-workbench.mjs web --dry-run`
- `node scripts/kirakira-workbench.mjs desktop --dry-run`
- `docker compose -f docker-compose.yml -f docker-compose.ports.yml config`
- `docker compose -f docker-compose.test.yml config`
- `pnpm.cmd exec vitest run test/unit/runtime/profile-resolution.test.ts test/unit/runtime/startup-contract.test.ts test/unit/scripts/workbench-launcher.test.ts test/unit/scripts/container-launcher.test.ts test/contract/runtime/runtime-profile-compose-contract.test.ts`
- `pnpm.cmd --filter @kirakira/web typecheck`
- `pnpm.cmd --filter @kirakira/desktop typecheck`
- `pnpm.cmd --filter @kirakira/web build`
- `pnpm.cmd --filter @kirakira/desktop build`
- `pnpm.cmd typecheck`
- `pnpm.cmd test`
