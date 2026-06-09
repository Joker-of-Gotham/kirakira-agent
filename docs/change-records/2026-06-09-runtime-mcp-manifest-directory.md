# Runtime MCP Manifest Directory

Date: 2026-06-09

## References

- Model Context Protocol lifecycle and capability negotiation:
  https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle
- Runtime manifest and request/response contract references already tracked in
  `docs/upgrade/eam-parity-roadmap.md`.

## Change

- Added a public `mcp` section to `RuntimeManifest`.
- Projected the daemon's resolved runtime profile MCP servers into the manifest
  as server names, commands, args, env key names, selected profile, and catalog
  groups.
- Passed the selected runtime profile name from daemon env config into
  `KernelBridgeOptions` so manifest projection follows the active profile.
- Sanitized MCP manifest data so environment values are never exposed.

## Why

The daemon previously exposed only `capabilities.mcp.state`. That was enough to
say MCP was available, but not enough for web, desktop, or future gateway
tool-call surfaces to reason about which MCP servers the runtime actually
composed from profiles.

This change keeps tool invocation out of scope until PEP/audit handling is
wired, but gives every surface the same public runtime directory.

## Validation

Passed before commit:

- `pnpm.cmd --filter @kirakira/runtime-contracts typecheck`
- `pnpm.cmd --filter @kirakira/runtime-contracts build`
- `pnpm.cmd exec vitest run test/unit/runtime-contracts/status.test.ts`
- `pnpm.cmd exec vitest run test/unit/runtime-daemon/daemon-lifecycle-health.test.ts test/unit/runtime-daemon/daemon-config.test.ts test/unit/runtime-daemon/browser-gateway-server.test.ts`
- `pnpm.cmd --filter @kirakira/runtime-daemon typecheck`
- `pnpm.cmd --filter @kirakira/runtime-daemon build`
