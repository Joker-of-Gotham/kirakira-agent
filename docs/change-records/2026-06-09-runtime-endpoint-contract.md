# Runtime Endpoint Contract

## Scope

- Centralized Kirakira presentation and browser gateway endpoint defaults in `@kirakira/runtime-contracts`.
- Wired web runtime config, browser gateway transport, daemon gateway defaults, and desktop renderer trust checks through the shared endpoint parser.
- Kept desktop packaged behavior intact: Electron only loads a dev renderer when `KIRAKIRA_DESKTOP_RENDERER_URL` or `KIRAKIRA_DESKTOP_DEV_URL` is explicitly set.
- Clarified that `127.0.0.1:5173` is not a Kirakira validation target. Current Kirakira defaults are web `127.0.0.1:5183`, desktop renderer `127.0.0.1:5174`, and browser gateway `ws://127.0.0.1:17373/runtime`.

## References

- Vite environment variables and mode handling: https://vite.dev/guide/env-and-mode
- Electron context isolation and context bridge boundary: https://www.electronjs.org/docs/latest/api/context-bridge
- Electron security checklist for trusted origins and renderer isolation: https://www.electronjs.org/docs/latest/tutorial/security
- Docker Compose environment interpolation: https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/

## Verification

- `pnpm.cmd exec vitest run test/unit/runtime-contracts/endpoint.test.ts test/unit/web/runtime-config.test.ts test/unit/frontend-core/browser-gateway-transport.test.ts test/unit/desktop/renderer-endpoint.test.ts test/unit/runtime-daemon/browser-gateway-server.test.ts`
- `pnpm.cmd typecheck`
- `pnpm.cmd test`
- `git diff --check`
