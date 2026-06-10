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
- Reads workbench view IA metadata from
  `packages/frontend-core/src/workbench-navigation.ts`; Web and Electron should
  use the shared `workbench-view-*` selectors, ARIA labels, and empty-state copy
  instead of inventing per-surface labels.
- Marks the shared root with `data-kk-presentation-surface="web"` or
  `data-kk-presentation-surface="desktop"` so smoke tests and visual QA can
  distinguish browser and Electron captures without relying on window title or
  environment copy.

## QA Entry Points

Run these after desktop presentation changes:

```powershell
node scripts/presentation-quality-gate.mjs --profile workbench-host --format markdown --artifact tmp/presentation-quality/workbench-host.json --fail-on-issues
node scripts/presentation-hydrated-visual-qa.mjs --gate presentation-hydrated-visual-qa --profile workbench-host --live --skip-infra --skip-daemon
pnpm --filter @kirakira/desktop typecheck
pnpm exec vitest run test/unit/desktop/startup-manifest.test.ts test/unit/desktop/main-security.test.ts test/unit/desktop/preload.test.ts test/unit/desktop/renderer-endpoint.test.ts test/unit/desktop/runtime-ipc.test.ts test/unit/desktop/desktop-transport.test.ts
```

The presentation gate is browser-safe: it resolves the runtime profile, checks
the shared renderer contract, validates multi-view IA density, and can write a
JSON QA artifact without starting Web, Electron, Docker, or local services. The
artifact also carries a seven-dimension visual review scorecard and mobile,
tablet, and desktop viewport targets so design QA has an archiveable record
before live screenshot automation is needed.

The hydrated visual QA gate is the screenshot automation layer:

- `configs/runtime/profiles.json` owns
  `presentationHydratedVisualQaGates.presentation-hydrated-visual-qa`.
- `scripts/presentation-hydrated-visual-qa.mjs` starts the selected
  web/desktop renderer surfaces through the workbench smoke harness, then uses
  an Electron offscreen `BrowserWindow` runner to open profile-derived URLs.
- The gate captures `web` and `desktop` screenshots for `mobile`, `tablet`,
  and `desktop` viewports, clicks the shared Runs, Agents, Research, and
  Systems navigation buttons, and fails on blank renders, page failures,
  unexpected console errors, horizontal overflow, or missing active-view
  markers.
- Durable evidence lives at
  `docs/upgrade/gates/presentation-hydrated-visual-qa.json`, with PNGs under
  `docs/upgrade/gates/presentation-hydrated-visual-qa/`.

Remaining design work:

- Document the shared web/desktop view taxonomy once multi-view workbench
  routing stabilizes.
- Run the same hydrated gate against the full Docker-backed daemon/gateway stack
  when Docker Desktop is available, instead of the renderer-only mock-runtime
  path used for fast visual QA.
