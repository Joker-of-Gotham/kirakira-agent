# Runtime IPC Contract Validation

## Summary

Desktop IPC now validates outbound daemon messages through
`@kirakira/runtime-contracts` instead of carrying a second local protocol
parser. Browser and desktop transports also clean up local subscriptions when
the daemon returns a correlated subscribe error.

This slice adds:

- runtime protocol validation for desktop submit, subscribe, unsubscribe,
  get-state, approve, cancel, and drain requests
- contract-backed rejection for invalid subscription filters such as unknown
  event kinds
- desktop subscribe-error forwarding to the owning renderer channel
- browser gateway subscribe-error cleanup for matching local subscriptions
- tests for protocol rejection and correlated subscribe failures

## Why

Desktop and browser runtime transports should behave as different carriers for
the same protocol, not as separate protocol implementations. The runtime
daemon already uses `parseRuntimeClientMessage`; desktop IPC now routes its
constructed client messages through that same parser before touching the
daemon client.

Correlated errors matter because runtime subscriptions are request/ack flows:
a failed subscribe request must not leave behind an inert local subscription
that still receives events or leaks memory.

## References

- Electron IPC documentation:
  https://www.electronjs.org/docs/latest/tutorial/ipc
- MDN WebSocket close event documentation:
  https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/close_event
- JSON-RPC 2.0 specification:
  https://www.jsonrpc.org/specification

## Verification

- `pnpm.cmd exec vitest run test/unit/runtime-contracts/runtime-protocol-codec.test.ts test/unit/desktop/runtime-ipc.test.ts test/unit/frontend-core/browser-gateway-transport.test.ts`
- `pnpm.cmd --filter @kirakira/runtime-contracts typecheck`
- `pnpm.cmd --filter @kirakira/frontend-core typecheck`
- `pnpm.cmd --filter @kirakira/desktop typecheck`
- `pnpm.cmd --filter @kirakira/runtime-contracts build`
- `pnpm.cmd --filter @kirakira/frontend-core build`
- `pnpm.cmd --filter @kirakira/desktop build`
- `pnpm.cmd typecheck`
- `pnpm.cmd test`
