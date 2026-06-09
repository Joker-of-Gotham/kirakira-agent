# Desktop Runtime Status Bridge

## Scope

- Added a dedicated Electron IPC status channel for desktop runtime status.
- Kept status outside the runtime WebSocket run-control protocol.
- Exposed `kirakiraRuntime.getStatus()` through preload as a single typed method, not a generic IPC bridge.
- Sanitized daemon health before it can cross from main to renderer.
- Tightened packaged renderer trust so arbitrary `file:` URLs are not treated as Kirakira renderers.
- Added desktop IPC, preload, renderer transport, and status contract regression coverage.

## References

- Electron context isolation: https://www.electronjs.org/docs/latest/tutorial/context-isolation
- Electron inter-process communication: https://www.electronjs.org/docs/latest/tutorial/ipc

## Verification

- `pnpm.cmd exec vitest run test/unit/runtime-contracts/status.test.ts test/unit/desktop/runtime-ipc.test.ts test/unit/desktop/desktop-transport.test.ts test/unit/desktop/preload.test.ts test/unit/desktop/renderer-endpoint.test.ts test/unit/runtime-contracts/runtime-protocol-codec.test.ts`
- `pnpm.cmd typecheck`
- `pnpm.cmd test`
- `git diff --check`
