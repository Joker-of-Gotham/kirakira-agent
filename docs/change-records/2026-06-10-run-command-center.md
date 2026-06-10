# Run Command Center Transport Slice

Date: 2026-06-10

## Scope

- Added a shared Run Command Center to the web and Electron workbench renderer.
- Extended the shared runtime transport with explicit `steer`, `enqueue`, `provideInput`, `resume`, and `inspect` methods.
- Exposed the same controls through browser gateway messages and Electron preload/main IPC without exposing raw IPC primitives.
- Kept the daemon client compatible with existing implicit `steer()` usage while adding explicit `steerRun(runId, ...)`.

## References Checked

- Electron `contextBridge` and context isolation guidance for the preload boundary.
- Electron `ipcMain.handle` guidance for request/response IPC.
- MDN `aria-live` guidance for command status updates.

## Validation

- `pnpm.cmd exec vitest run test/unit/frontend-core/browser-gateway-transport.test.ts test/unit/desktop/runtime-ipc.test.ts test/unit/desktop/preload.test.ts test/unit/desktop/desktop-transport.test.ts test/unit/frontend-app/presentation-render-evidence.test.ts`
- `pnpm.cmd --filter @kirakira/frontend-core typecheck`
- `pnpm.cmd --filter @kirakira/frontend-app typecheck`
- `pnpm.cmd --filter @kirakira/desktop typecheck`
- `pnpm.cmd --filter @kirakira/runtime-daemon typecheck`
- `pnpm.cmd presentation:render -- --profile workbench-host --format json --write-result docs/upgrade/gates/presentation-render-evidence.json`
- `node scripts/presentation-quality-gate.mjs --profile workbench-host --format markdown --artifact tmp/presentation-quality/workbench-host.json --fail-on-issues`
- `VITE_KIRAKIRA_RUNTIME_MODE=mock node scripts/presentation-hydrated-visual-qa.mjs --gate presentation-hydrated-visual-qa --profile workbench-host --timeout-ms 180000 --skip-infra --skip-daemon --live`
- `node scripts/upgrade-readiness.mjs --profile workbench-host --format markdown --write docs/upgrade/gates/upgrade-readiness.md --fail-on-issues`

## Result

- Upgrade readiness remains `24 pass / 1 warn / 0 fail`.
- The remaining warning is unchanged: the full Docker-backed web/Electron lifecycle gate is blocked by Docker preflight evidence.
