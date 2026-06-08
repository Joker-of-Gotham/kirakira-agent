# Runtime Contracts, Web, And Desktop Foundation

Date: 2026-06-08
Branch: `codex/runtime-orchestration-profile-baseline`

## Source Baselines

- Electron context isolation and security guidance: renderer code must not receive raw Electron or Node primitives; preload exposes narrow APIs; main owns privileged runtime access.
- Electron Forge Vite structure: main, preload, and renderer stay as separate build targets.
- Vite library/build guidance: browser-facing packages should externalize implementation runtimes and expose stable package contracts.
- React external store guidance: UI state should subscribe to runtime streams through an explicit transport surface.
- WCAG 2.2 target and contrast guidance: controls use stable target sizes, visible focus, and restrained status color.

## Agent Findings Applied

- Hypatia: split serializable runtime events, controls, protocol frames, and snapshots into a browser-safe package before web or desktop imports.
- Chandrasekhar: copy OpenHuman's semantic patterns only: provider stack, projection-driven UI, timeline dedupe, compact subagent rows, citation chips, and theme mechanics.
- McClintock: keep Electron daemon access in main, expose typed preload methods only, and configure `contextIsolation`, `nodeIntegration: false`, and `sandbox: true`.
- Faraday: keep `frontend-core` as the stable projection and transport layer, and dedupe live/replay events by event id.

## Implementation

- Added `@kirakira/runtime-contracts` for browser-safe `RunEvent`, `ControlMessage`, daemon protocol, runtime mode/options, and state snapshot types.
- Repointed `event-store`, `frontend-core`, `orchestrator-kernel`, and `runtime-daemon` to the shared contract package.
- Added `@kirakira/frontend-app`, a shared React workbench with run navigation, event timeline, subagent delegation, research evidence, approval gate, runtime details, and mock transport.
- Added `apps/web`, a Vite React shell using the shared workbench.
- Added `apps/desktop`, an Electron shell with secure main/preload/renderer separation and a typed daemon IPC bridge.
- Added a browser-boundary unit test that scans `frontend-core`, `frontend-app`, and `runtime-contracts` for Node/runtime implementation imports.

## Validation

- `pnpm.cmd --filter @kirakira/runtime-contracts typecheck`
- `pnpm.cmd --filter @kirakira/event-store typecheck`
- `pnpm.cmd --filter @kirakira/frontend-core typecheck`
- `pnpm.cmd --filter @kirakira/orchestrator-kernel typecheck`
- `pnpm.cmd --filter @kirakira/runtime-daemon typecheck`
- `pnpm.cmd --filter @kirakira/frontend-app typecheck`
- `pnpm.cmd --filter @kirakira/web typecheck`
- `pnpm.cmd --filter @kirakira/desktop typecheck`
- `pnpm.cmd --filter @kirakira/runtime-contracts build`
- `pnpm.cmd --filter @kirakira/event-store build`
- `pnpm.cmd --filter @kirakira/frontend-core build`
- `pnpm.cmd --filter @kirakira/orchestrator-kernel build`
- `pnpm.cmd --filter @kirakira/runtime-daemon build`
- `pnpm.cmd --filter @kirakira/frontend-app build`
- `pnpm.cmd --filter @kirakira/web build`
- `pnpm.cmd --filter @kirakira/desktop build`
- `pnpm.cmd exec vitest run test/unit/frontend-core/projection.test.ts test/unit/frontend-core/browser-boundary.test.ts test/unit/event-store/research-projector.test.ts test/unit/event-store/subagent-projector.test.ts`
- `rg -n '@kirakira/event-store|@kirakira/runtime-daemon|@kirakira/orchestrator-kernel|better-sqlite3|node:|from "ws"|from ''ws''' packages\frontend-core\src packages\frontend-app\src packages\runtime-contracts\src`
- `Invoke-WebRequest -UseBasicParsing http://127.0.0.1:5173`

## Known Limits

- The web shell currently uses a mock transport by default; gateway-backed browser transport is the next runtime integration slice.
- Desktop IPC uses the daemon client and filters renderer subscriptions in main, but daemon-side unsubscribe acknowledgement is still a follow-up.
- Automated screenshot inspection was attempted through the available Node REPL browser path, but the REPL kernel failed before Playwright could launch. No local Edge, Chrome, or Chromium executable was on PATH.
