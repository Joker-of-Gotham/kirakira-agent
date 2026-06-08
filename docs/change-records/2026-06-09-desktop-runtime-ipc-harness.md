# Desktop Runtime IPC Harness

## Summary

Desktop runtime IPC now routes through a testable controller in
`apps/desktop/src/main/runtime-ipc.ts` instead of keeping subscription state and
payload handling inline in Electron `main.ts`.

The controller owns:

- trusted renderer sender checks
- runtime payload validation before daemon calls
- subscribe ack correlation
- daemon-side unsubscribe after normal or early renderer unsubscribe
- local event fan-out to the owning renderer

## Why

The desktop renderer already used context isolation, sandboxing, and a narrow
preload bridge, but the main-process IPC handlers still accepted typed payloads
without runtime checks and were hard to unit test.

This follows Electron's current security guidance that context isolation alone
is not enough: IPC APIs should be narrow, argument-filtered, and sender-checked.

## Verification

- `pnpm.cmd exec vitest run test/unit/desktop/runtime-ipc.test.ts test/unit/frontend-core/browser-gateway-transport.test.ts test/unit/runtime-daemon/browser-gateway-server.test.ts`
- `pnpm.cmd --filter @kirakira/desktop typecheck`
- `node --check apps/desktop/src/main/main.ts`
