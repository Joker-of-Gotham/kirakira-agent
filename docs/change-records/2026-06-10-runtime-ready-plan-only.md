# Runtime Ready Plan-Only Entry

Date: 2026-06-10

## Change

- Added `scripts/runtime-ready.mjs` as the unified plan-only readiness entry.
- Added the root script `runtime:ready`.
- Added `kirakira-agent runtime ready` through the CLI runtime script registry.
- Added unit and contract coverage for:
  - no live probes,
  - no Docker/process execution,
  - profile-projection-only MCP output,
  - no local `.mcp.json` overlay,
  - no unrelated `5173` dev-server target.
- Extended `upgrade-readiness` so the harness/API track requires
  `runtime:profile`, `runtime:ready`, and `runtime:doctor`.

## External Constraints

- Docker Compose documents `docker compose up` as the command that creates and
  starts multi-container applications, with `--detach` leaving services running
  in the background: <https://docs.docker.com/reference/cli/docker/compose/up/>.
- Docker Compose global options document `-f/--file` and profile/project
  controls used by the runtime profile projection:
  <https://docs.docker.com/reference/cli/docker/compose/>.
- MCP tools are exposed by servers for discovery and invocation through the
  protocol rather than by ad hoc local config overlays:
  <https://modelcontextprotocol.io/specification/2025-11-25/server/tools>.

## Validation

```powershell
pnpm.cmd exec vitest run test/unit/runtime/runtime-ready.test.ts test/unit/cli/runtime-ready-command.test.ts test/unit/cli/runtime-script-command.test.ts test/unit/runtime/startup-contract.test.ts test/unit/runtime/profile-resolution.test.ts
node scripts/runtime-ready.mjs --profile workbench-host --json
pnpm.cmd --filter @kirakira/cli typecheck
git diff --check
```

## Boundary

`runtime:ready` is intentionally not a replacement for `runtime:doctor`.
`runtime:ready` renders profile-owned readiness, MCP, compose, and startup
plans without sockets, HTTP probes, TCP probes, Docker execution, or local MCP
overlay. `runtime:doctor` remains the explicit live probe command.
