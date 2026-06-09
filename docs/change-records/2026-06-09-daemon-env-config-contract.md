# Daemon Env Config Contract

Date: 2026-06-09

## Summary

Extracted daemon startup environment parsing into a typed, testable helper.

The runtime daemon binary now calls `daemonConfigFromEnv(process.env)` instead
of rebuilding socket, event-store, browser-gateway, and workspace-root handling
inline. Tests feed the helper with `renderRuntimeEnv(resolveRuntimeProfile(...))`
so profile rendering and daemon consumption share one contract.

## Design References

- Node.js environment variable documentation:
  https://nodejs.org/api/environment_variables.html
- MCP lifecycle capability negotiation, 2025-06-18:
  https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle
- Electron context isolation and security guidance for profile-fed desktop
  renderer/runtime boundaries:
  https://www.electronjs.org/docs/latest/tutorial/context-isolation
  https://www.electronjs.org/docs/latest/tutorial/security

## Changed Files

- `packages/runtime-daemon/src/bin/daemon-config.ts`
- `packages/runtime-daemon/src/bin/kirakira-runtime-daemon.ts`
- `packages/runtime-daemon/src/index.ts`
- `test/unit/runtime-daemon/daemon-config.test.ts`

## Boundaries

- This slice centralizes daemon env consumption; it does not yet load
  `agent.toml`/resolved config into the daemon kernel.
- `workbench-host` remains the profile source for web `5183`, desktop renderer
  `5174`, and runtime gateway `17373`.
- Docker/container filesystem boundaries remain controlled by the profile and
  existing workspace root guards.

## Validation

Passed in this slice:

- `pnpm.cmd --filter @kirakira/runtime-daemon typecheck`
- `pnpm.cmd --filter @kirakira/runtime-daemon build`
- `pnpm.cmd exec vitest run test/unit/runtime-daemon/daemon-config.test.ts test/unit/runtime/profile-resolution.test.ts test/unit/scripts/workbench-launcher.test.ts`
- `git diff --check`
