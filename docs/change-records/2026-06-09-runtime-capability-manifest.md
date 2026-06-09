# Runtime Capability Manifest

Date: 2026-06-09

## Summary

Added a typed, sanitized runtime capability manifest so daemon, browser gateway,
web, and desktop surfaces can share one public capability contract instead of
hardcoding feature assumptions in each client.

The manifest is available through:

- `RuntimeDaemonHealth.details.manifest`
- `RuntimeBrowserGatewayHealth.manifest`
- browser gateway `GET /manifest`
- frontend-core `fetchBrowserGatewayManifest()`

## Changed Files

- `packages/runtime-contracts/src/status.ts`
- `packages/runtime-contracts/src/index.ts`
- `packages/runtime-daemon/src/server/browser-gateway-server.ts`
- `packages/runtime-daemon/src/lifecycle/daemon-lifecycle.ts`
- `packages/runtime-daemon/src/bridge/gateway-bridge.ts`
- `packages/frontend-core/src/browser-gateway-health.ts`
- `packages/frontend-core/src/index.ts`
- `test/unit/runtime-contracts/status.test.ts`
- `test/unit/runtime-daemon/browser-gateway-server.test.ts`
- `test/unit/runtime-daemon/daemon-lifecycle-health.test.ts`
- `test/unit/frontend-core/browser-gateway-health.test.ts`

## Design References

- MCP specification 2025-11-25: capability negotiation, tools/resources/prompts,
  progress, cancellation, logging, and consent/security expectations.
  https://modelcontextprotocol.io/specification/2025-11-25
- SMCP paper: identity, mutual authentication, policy enforcement, and audit
  logging as production MCP security requirements.
  https://arxiv.org/abs/2602.01129
- Pydantic Settings docs: explicit environment aliases and precedence rules for
  runtime-profile-driven configuration.
  https://pydantic.dev/docs/validation/dev/concepts/pydantic_settings/

## Boundaries

- No provider, model, MCP server, or secret names are hardcoded into the
  manifest.
- The manifest reports capability states, contract surfaces, and public
  endpoints only.
- `tokenRequired` is exposed, but token values are never serialized.
- Kirakira ports remain web `5183`, desktop renderer `5174`, and runtime gateway
  `17373`; `5173` is not a Kirakira validation target.
- `GatewayBridgeOptions.disabled` is only an explicit embedding/test switch.
  Default gateway startup behavior is unchanged.

## Validation

- `pnpm.cmd --filter @kirakira/runtime-contracts typecheck`
- `pnpm.cmd --filter @kirakira/runtime-contracts build`
- `pnpm.cmd --filter @kirakira/runtime-daemon typecheck`
- `pnpm.cmd --filter @kirakira/frontend-core typecheck`
- `pnpm.cmd vitest run test/unit/runtime-contracts/status.test.ts test/unit/runtime-daemon/browser-gateway-server.test.ts test/unit/runtime-daemon/daemon-lifecycle-health.test.ts test/unit/frontend-core/browser-gateway-health.test.ts`
