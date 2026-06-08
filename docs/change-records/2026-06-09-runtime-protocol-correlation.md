# Runtime Protocol Correlation

Date: 2026-06-09
Branch: `codex/runtime-orchestration-profile-baseline`

## Correction

- `http://127.0.0.1:5173/` was rechecked during this slice and returned the `Self-Ontology OS` document, so it is not a Kirakira validation target.
- `http://127.0.0.1:5183/` returned the `Kirakira Agent` document and remains the explicit Kirakira web validation target for this workstation state.

## Source Baselines

- JSON-RPC 2.0 preserves request correlation by echoing request `id` on success and error responses.
- MCP builds on JSON-RPC-style request, response, and notification messaging, so runtime bridge errors should keep the originating message identifier when possible.
- Browser WebSocket clients receive server frames through `message` events, so browser-safe parsing must happen before dispatching application state.
- Electron security guidance keeps privileged runtime access in main/preload boundaries with explicit IPC APIs, not renderer-global daemon access.

## Agent Findings Applied

- Descartes: runtime contract types needed browser-safe runtime validation and correlated protocol errors instead of downstream casts.
- Godel: daemon and browser clients needed per-request error correlation; uncorrelated server errors must not reject every pending request.
- Plato: desktop subscriptions needed daemon-side unsubscribe propagation, ownership checks, and early-unsubscribe handling before daemon acknowledgement.
- Russell: regression coverage needed to exercise malformed correlated frames, browser unsubscribe-before-ack, and request tracker behavior.

## Implementation

- Added shared runtime protocol parsing, server-message validation, correlated error helpers, and a reusable `RuntimeRequestTracker` to `@kirakira/runtime-contracts`.
- Updated daemon server parsing to reuse the shared contract validators and return correlated protocol errors for malformed control/filter frames.
- Reworked `DaemonClient` request handling so correlated errors reject only the matching pending request, while uncorrelated errors remain observable server messages.
- Extended daemon lifecycle unsubscribe handling with subscription ownership checks and correlated `unknown_subscription` errors.
- Reworked browser gateway transport request tracking to use the shared tracker and fixed the unsubscribe-before-`subscribed` acknowledgement path.
- Reworked desktop main-process runtime subscriptions to pass filters to daemon subscriptions, map local subscription ids to daemon ids, enforce sender ownership, and propagate unsubscribe to the daemon.
- Added targeted unit coverage for runtime protocol codec/tracker behavior, browser gateway transport correlation, early unsubscribe cleanup, and malformed daemon gateway frames.

## Validation

- `pnpm.cmd exec vitest run test/unit/runtime-contracts/runtime-protocol-codec.test.ts test/unit/frontend-core/browser-gateway-transport.test.ts test/unit/runtime-daemon/browser-gateway-server.test.ts`
- `pnpm.cmd --filter @kirakira/runtime-contracts build`
- `pnpm.cmd --filter @kirakira/runtime-daemon build`
- `pnpm.cmd --filter @kirakira/frontend-core typecheck`
- `pnpm.cmd --filter @kirakira/desktop typecheck`
- `pnpm.cmd --filter @kirakira/web build`
- `pnpm.cmd --filter @kirakira/desktop build`
- `Invoke-WebRequest -UseBasicParsing http://127.0.0.1:5173/` returned `Self-Ontology OS`.
- `Invoke-WebRequest -UseBasicParsing http://127.0.0.1:5183/` returned `Kirakira Agent`.
- In-app Browser verification was attempted twice against `http://127.0.0.1:5183/`, but Browser setup failed before navigation with `windows sandbox failed: spawn setup refresh`.

## Known Limits

- This slice hardens the protocol and subscription lifecycle; it does not yet add authenticated Electron IPC sender allowlists beyond existing webContents ownership checks.
- Browser visual verification should use `127.0.0.1:5183` or another explicit Kirakira port, never the unrelated `5173` listener.
