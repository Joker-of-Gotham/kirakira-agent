# Profile Driven Workbench And Socket

Date: 2026-06-09
Branch: `codex/runtime-orchestration-profile-baseline`

## Source Baselines

- Docker Compose supports multiple `-f` files and profiles, so profile data should own compose-file/profile selection instead of parallel launcher constants.
- Vite exposes only `VITE_*` variables to browser code and treats them as strings, so browser runtime URLs need deliberate profile rendering.
- Node child processes inherit explicit `env` and `stdio` behavior from spawn options, and Windows environment/path handling needs platform-aware normalization.
- Electron guidance requires narrow preload/IPC APIs and sender validation; desktop runtime wiring should stay profile-driven while preserving main/preload boundaries.

## Agent Findings Applied

- Avicenna: `SERVICE_ENV` and daemon/web/desktop env aliases were hardcoded in `runtime-profile.mjs`; move them into runtime profile data with a small computed registry.
- Ptolemy: `workbench-host` rendered a POSIX `.sock` path on Windows host; resolve it to a stable named pipe and use the same resolver in daemon clients and server lifecycle.
- Franklin: web/desktop startup env must flow through the profile workbench path so `5183`, `5174`, and gateway URLs remain one coherent surface.
- Galileo: add regression coverage so new workbench surfaces/packages are data-driven and `5173` cannot silently return through generated startup plans.

## Implementation

- Added top-level `envBindings` to `configs/runtime/profiles.json` for service URLs, direct aliases, boolean aliases, joined list aliases, and computed browser gateway endpoint output.
- Moved workbench package/script/surface definitions into the `workbench-host` profile with `defaultSurface`, `packages`, and `surfaces`.
- Reworked `scripts/runtime-profile.mjs` to render env values from declarative bindings instead of owning the service/env alias table in code.
- Reworked `scripts/kirakira-workbench.mjs` to parse arbitrary profile-declared surfaces and render package/command steps from profile data, including `skipWhen` rules.
- Added `packages/runtime-daemon/src/ipc/socket-path.ts` so daemon lifecycle, `DaemonClient`, and `EventSubscriber` share one platform-aware daemon socket resolver.
- Updated `UdsServer` so Windows named pipe paths skip POSIX stale-socket filesystem cleanup.
- Exported socket path helpers from `@kirakira/runtime-daemon` for SDK/API reuse.
- Added unit coverage for declarative env bindings, configurable workbench surfaces, unknown surface/package failures, and Windows/POSIX daemon socket resolution.

## Validation

- `pnpm.cmd exec vitest run test/unit/runtime/profile-resolution.test.ts test/unit/scripts/workbench-launcher.test.ts test/unit/runtime-daemon/socket-path.test.ts`
- `pnpm.cmd --filter @kirakira/runtime-daemon typecheck`
- `pnpm.cmd --filter @kirakira/runtime-daemon build`
- `node scripts/runtime-profile.mjs env workbench-host`
- `node scripts/kirakira-workbench.mjs web --dry-run`
- `node scripts/kirakira-workbench.mjs desktop --dry-run`

## Known Limits

- `scripts/kirakira.mjs` still has its own container startup control plane; the next ecosystem slice should move its service/image topology behind runtime profiles.
- Vite config files still have local fallback ports; the workbench path now renders profile env explicitly, but direct package-level dev scripts can still bypass the profile.
- Runtime profile JSON has lightweight structural checks only; a schema/contract layer should reject malformed bindings before rendering.
