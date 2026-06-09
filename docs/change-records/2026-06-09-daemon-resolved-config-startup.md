# Daemon Resolved Config Startup

Date: 2026-06-09

## Summary

Connected runtime daemon startup to the same resolved config pipeline used by
the rest of Kirakira instead of leaving daemon orchestration on env-only
defaults.

When `KIRAKIRA_WORKSPACE_ROOT` is present, `daemonConfigFromEnv` now loads
`agent.toml`, `policy.yaml`, local workspace overrides, and runtime profile
state through `@kirakira/config-resolver`. The resolved state is passed to
`KernelBridge`, and selected orchestration settings are projected into kernel
options:

- `orchestration.max_concurrency` -> delegated lane capacity
- `orchestration.default_subagent_turns` -> parent worker turn limit
- `orchestration.subagent_system_preamble` -> parent worker system prompt
- `model.default` -> parent worker model
- resolved runtime profile MCP servers -> plan context and daemon MCP manifest
  capability

## Design References

- Node.js environment variable documentation:
  https://nodejs.org/api/environment_variables.html
- Docker Compose environment variable documentation:
  https://docs.docker.com/compose/how-tos/environment-variables/set-environment-variables/
- MCP lifecycle capability negotiation, 2025-06-18:
  https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle

## Changed Files

- `packages/runtime-daemon/src/bin/daemon-config.ts`
- `packages/runtime-daemon/src/bridge/kernel-bridge.ts`
- `packages/runtime-daemon/src/bridge/deep-research.ts`
- `packages/runtime-daemon/src/lifecycle/daemon-lifecycle.ts`
- `packages/orchestrator-kernel/src/daemon-orchestrator.ts`
- `packages/runtime-daemon/package.json`
- `pnpm-lock.yaml`
- `test/unit/runtime-daemon/daemon-config.test.ts`
- `test/unit/runtime-daemon/daemon-lifecycle-health.test.ts`

## Boundaries

- This slice wires resolved config into daemon/kernel startup. It does not yet
  replace the CLI-local config loader or fully execute MCP tools through the
  browser gateway.
- The profile contract still uses Kirakira ports: web `5183`, desktop renderer
  `5174`, runtime gateway `17373`. It must not rely on Vite's unrelated default
  `5173`.

## Validation

Passed in this slice:

- `pnpm.cmd install --no-frozen-lockfile`
- `pnpm.cmd --filter @kirakira/config-resolver typecheck`
- `pnpm.cmd --filter @kirakira/config-resolver build`
- `pnpm.cmd --filter @kirakira/orchestrator-kernel typecheck`
- `pnpm.cmd --filter @kirakira/orchestrator-kernel build`
- `pnpm.cmd --filter @kirakira/runtime-daemon typecheck`
- `pnpm.cmd --filter @kirakira/runtime-daemon build`
- `pnpm.cmd exec vitest run test/unit/runtime-daemon/daemon-config.test.ts test/unit/runtime-daemon/daemon-lifecycle-health.test.ts test/unit/runtime/profile-resolution.test.ts test/unit/scripts/workbench-launcher.test.ts`
- `git diff --check`
