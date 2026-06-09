# Desktop + Web Presentation Contract

Date: 2026-06-09

## Reference Notes

OpenHuman keeps the desktop shell thin: the shell owns the WebView, window
behavior, a small IPC surface, and core process bridging while domain logic stays
outside the renderer. Kirakira's Electron surface follows the same split:
`apps/desktop` hosts the shared workbench renderer and forwards only typed
runtime operations to the daemon over the preload bridge.

## Startup Manifest

`apps/desktop/src/main/startup-manifest.ts` is the desktop startup source of
truth. It resolves:

- Renderer source: `KIRAKIRA_DESKTOP_RENDERER_URL` first, then
  `KIRAKIRA_DESKTOP_DEV_URL`, and finally the packaged renderer file.
- Smoke contract: `KIRAKIRA_WORKBENCH_ELECTRON_SMOKE=1` hides the window and
  bounds launch with `KIRAKIRA_WORKBENCH_ELECTRON_SMOKE_TIMEOUT_MS`.
- Window and WebPreferences: context isolation on, renderer Node integration
  off, sandbox on, and preload path from the compiled main directory.
- Preload API: the public `window.kirakiraRuntime` method list is published in
  the manifest for tests and docs.

Renderer and gateway ports must come from runtime profile/env resolution. The
desktop main process must not invent dev-server URLs.

## Electron Boundary

Main process:

- Loads only the resolved loopback renderer URL or the packaged renderer file.
- Verifies runtime IPC senders with `isTrustedDesktopRuntimeSenderUrl`.
- Denies `window.open` inside Electron; external `http`, `https`, and `mailto`
  URLs are passed to `shell.openExternal`.
- Prevents top-level navigation away from the trusted renderer and optionally
  opens browser-safe external URLs outside Electron.

Preload:

- Exposes only `window.kirakiraRuntime`.
- Uses named IPC channels from `preload-contract.ts`.
- Does not expose generic `send`, `invoke`, Electron, Node, or filesystem
  primitives to renderer code.

Renderer:

- Treats the desktop bridge as optional and falls back to unavailable status
  when the bridge cannot answer.
- Shares the same runtime transport shape as the web workbench.

## QA Entry Points

Run these after desktop presentation changes:

```powershell
node scripts/presentation-quality-gate.mjs --profile workbench-host --format markdown --artifact tmp/presentation-quality/workbench-host.json --fail-on-issues
pnpm --filter @kirakira/desktop typecheck
pnpm exec vitest run test/unit/desktop/startup-manifest.test.ts test/unit/desktop/main-security.test.ts test/unit/desktop/preload.test.ts test/unit/desktop/renderer-endpoint.test.ts test/unit/desktop/runtime-ipc.test.ts test/unit/desktop/desktop-transport.test.ts
```

The presentation gate is browser-safe: it resolves the runtime profile, checks
the shared renderer contract, validates multi-view IA density, and can write a
JSON QA artifact without starting Web, Electron, Docker, or local services.

Remaining design work:

- Document the shared web/desktop view taxonomy once multi-view workbench
  routing stabilizes.
- Capture archived visual QA snapshots from the presentation gate once renderer
  screenshot automation lands.
