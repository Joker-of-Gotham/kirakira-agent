# Runtime Status Health Contract

## Scope

- Added browser-safe runtime health contracts for daemon and browser gateway status.
- Made browser gateway `/healthz` return typed endpoint metadata plus `tokenRequired`, without exposing tokens.
- Made `DaemonLifecycle.health()` return the same typed status shape while preserving legacy top-level booleans.
- Added a frontend gateway health client and optional transport status probe for the web workbench.
- Kept run-control WebSocket frames focused on run operations; status remains a separate HTTP/frontend status surface in this slice.

## References

- Kubernetes liveness/readiness/startup probes: https://kubernetes.io/docs/concepts/workloads/pods/probes/
- Electron context isolation: https://www.electronjs.org/docs/latest/tutorial/context-isolation
- Vite env exposure rules: https://vite.dev/guide/env-and-mode

## Verification

- `pnpm.cmd exec vitest run test/unit/runtime-contracts/status.test.ts test/unit/runtime-contracts/runtime-protocol-codec.test.ts test/unit/frontend-core/browser-gateway-health.test.ts test/unit/frontend-core/browser-gateway-transport.test.ts test/unit/frontend-core/browser-boundary.test.ts test/unit/runtime-daemon/browser-gateway-server.test.ts test/unit/runtime-daemon/daemon-lifecycle-health.test.ts test/unit/web/runtime-config.test.ts test/unit/web/web-vite-config.test.ts test/unit/desktop/vite.renderer.config.test.ts`
- `pnpm.cmd typecheck`
- `pnpm.cmd test`
- `git diff --check`
