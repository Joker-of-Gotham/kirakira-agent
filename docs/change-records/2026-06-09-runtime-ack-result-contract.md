# Runtime Ack Result Contract

Date: 2026-06-09

## References

- JSON-RPC 2.0 request/response correlation:
  https://www.jsonrpc.org/specification
- WebSocket bidirectional message validation:
  https://www.rfc-editor.org/rfc/rfc6455
- TypeScript discriminated unions and exhaustiveness:
  https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions

## Change

- Added runtime ack result parsers in `@kirakira/runtime-contracts` for submit,
  state snapshot, artifact content, and empty ack responses.
- Extended `RuntimeRequestTracker.track()` with an optional typed result parser
  while preserving existing request correlation semantics.
- Replaced browser gateway transport and daemon client local result casts with
  the shared parser layer.

## Why

The runtime protocol already had typed client/server envelopes, but ack payloads
were still `unknown` at the consumer boundary. This forced submit, get-state,
artifact, and inspect paths to hand-roll shape checks or casts in each client.

Keeping the wire format unchanged while centralizing payload parsing makes the
daemon socket, browser gateway, desktop IPC bridge, and future MCP invocation
path consume one protocol contract.

## Validation

Passed before commit:

- `pnpm.cmd --filter @kirakira/runtime-contracts typecheck`
- `pnpm.cmd --filter @kirakira/runtime-contracts build`
- `pnpm.cmd --filter @kirakira/frontend-core typecheck`
- `pnpm.cmd --filter @kirakira/frontend-core build`
- `pnpm.cmd --filter @kirakira/runtime-daemon typecheck`
- `pnpm.cmd --filter @kirakira/runtime-daemon build`
- `pnpm.cmd exec vitest run test/unit/runtime-contracts/runtime-protocol-codec.test.ts test/unit/frontend-core/browser-gateway-transport.test.ts test/unit/desktop/runtime-ipc.test.ts test/unit/desktop/desktop-transport.test.ts`
