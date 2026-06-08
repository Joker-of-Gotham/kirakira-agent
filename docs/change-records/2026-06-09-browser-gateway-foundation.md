# Browser Gateway Foundation

Date: 2026-06-09
Branch: `codex/runtime-orchestration-profile-baseline`

## Correction

- `http://127.0.0.1:5173` is not a Kirakira validation target in the current workstation state. It was checked on 2026-06-09 and served another local project titled `Self-Ontology OS`.
- Kirakira web validation for this slice uses package builds, targeted runtime tests, browser-boundary scans, and the explicit `start:web` strict-port script on `127.0.0.1:5183`.

## Source Baselines

- Browser clients use the standard WebSocket API and cannot import Node socket or daemon implementation modules.
- The `ws` server remains a Node-side runtime dependency with per-message compression disabled for local control traffic.
- Vite exposes browser configuration through `VITE_*` variables, so gateway selection must be explicit in the web shell.
- Electron keeps privileged daemon access in main/preload boundaries rather than renderer code.

## Agent Findings Applied

- Dewey: bind the browser gateway to loopback by default, enforce origin checks, and require a token before non-loopback binding.
- Noether: add an explicit `mock | gateway | auto` web runtime mode so production does not silently fall back to mock without a configured gateway endpoint.
- Darwin: expose a first-class runtime daemon start surface instead of leaving the new gateway reachable only through tests.
- Poincare: keep the runtime orchestration shell distinct from the reference UI and let the shared workbench consume transport contracts.

## Implementation

- Added a reusable runtime socket hub shared by the Unix-domain socket server and the browser gateway server.
- Added a loopback browser WebSocket gateway with `/healthz`, path validation, origin allowlisting, optional token validation, and non-loopback token enforcement.
- Extended daemon lifecycle health, event dispatch, client sends, and shutdown to cover both UDS and browser gateway clients.
- Added a runtime daemon CLI entrypoint and package `start` script with `KIRAKIRA_BROWSER_GATEWAY_*`, `KIRAKIRA_DAEMON_SOCKET`, and `KIRAKIRA_EVENT_STORE_PATH` environment support.
- Added a browser-safe frontend transport for gateway-backed submit, subscribe, unsubscribe, approve, cancel, drain, and state requests.
- Added web runtime config for `VITE_KIRAKIRA_RUNTIME_MODE`, `VITE_KIRAKIRA_GATEWAY_URL`, and `VITE_KIRAKIRA_GATEWAY_TOKEN`.
- Added targeted unit coverage for the gateway server, browser transport, web runtime config, and expanded browser-boundary checks.

## Validation

- `pnpm.cmd --filter @kirakira/runtime-contracts build`
- `pnpm.cmd --filter @kirakira/runtime-daemon typecheck`
- `pnpm.cmd --filter @kirakira/runtime-daemon build`
- `pnpm.cmd --filter @kirakira/frontend-core typecheck`
- `pnpm.cmd --filter @kirakira/frontend-core build`
- `pnpm.cmd --filter @kirakira/frontend-app typecheck`
- `pnpm.cmd --filter @kirakira/web typecheck`
- `pnpm.cmd --filter @kirakira/web build`
- `pnpm.cmd --filter @kirakira/desktop build`
- `pnpm.cmd exec vitest run test/unit/frontend-core/browser-gateway-transport.test.ts test/unit/frontend-core/browser-boundary.test.ts test/unit/web/runtime-config.test.ts test/unit/runtime-daemon/browser-gateway-server.test.ts`
- `pnpm.cmd start:web` foreground validation reached `http://127.0.0.1:5183/` and returned the `Kirakira Agent` document.
- A persistent web dev server was started outside the sandbox at `http://127.0.0.1:5183/` because sandbox-launched background Vite processes exited when stdin closed.

## Known Limits

- The web shell needs the daemon and gateway started separately before `VITE_KIRAKIRA_GATEWAY_URL` can point at live runtime traffic.
- Desktop still uses its existing main/preload daemon bridge; the browser gateway is for web clients.
- Visual browser verification should use `127.0.0.1:5183` or another explicit Kirakira port, not whatever is listening on `5173`.
- In-app Browser verification was attempted twice after the server came up, but the local browser runtime failed during setup with `windows sandbox failed: spawn setup refresh`.
