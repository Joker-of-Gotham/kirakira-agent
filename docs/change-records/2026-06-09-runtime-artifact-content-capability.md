# Runtime Artifact Content Capability

Date: 2026-06-09

## Summary

Promoted artifact content preview from a UI-only behavior into the public
runtime capability contract.

The `artifacts` capability now advertises:

- `artifact.created` and `artifact.updated` event projection support
- `get_artifact` as the bounded content-preview request
- default and hard maximum preview byte limits

When the daemon is running, its manifest marks `artifacts` as `enabled`; the
pre-start static manifest keeps the capability `available`.

## Design References

- MCP lifecycle capability negotiation, 2025-06-18:
  https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle
- JSON-RPC 2.0 request/response correlation and error model:
  https://www.jsonrpc.org/specification
- Electron context isolation and narrow preload APIs:
  https://www.electronjs.org/docs/latest/api/context-bridge
  https://www.electronjs.org/docs/latest/tutorial/security

## Changed Files

- `packages/runtime-contracts/src/status.ts`
- `packages/runtime-daemon/src/lifecycle/daemon-lifecycle.ts`
- `test/unit/runtime-contracts/status.test.ts`
- `test/unit/runtime-daemon/daemon-lifecycle-health.test.ts`

## Boundaries

- The manifest exposes byte limits and message types, not artifact paths or
  content.
- Renderer surfaces still request content through typed runtime IPC/transport
  calls; they do not receive arbitrary filesystem access.
- Kirakira validation remains on web `5183`, desktop renderer `5174`, and
  runtime gateway `17373`.

## Validation

- `pnpm.cmd --filter @kirakira/runtime-contracts typecheck`
- `pnpm.cmd --filter @kirakira/runtime-daemon typecheck`
- `pnpm.cmd exec vitest run test/unit/runtime-contracts/status.test.ts test/unit/runtime-daemon/daemon-lifecycle-health.test.ts`
- `git diff --check`
