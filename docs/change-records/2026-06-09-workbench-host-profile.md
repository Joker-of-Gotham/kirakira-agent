# Workbench Host Profile

Date: 2026-06-09
Branch: `codex/runtime-orchestration-profile-baseline`

## Source Baselines

- Docker Compose keeps multi-service application topology in compose files and uses profiles/CLI arguments to select service subsets.
- Node child processes need explicit foreground/background ownership, stdio, and shutdown handling when used as a local workbench launcher.
- Vite only exposes `VITE_*` variables to browser code, so the runtime gateway URL must be rendered deliberately.
- Electron renderer code must stay behind preload/context-isolation boundaries and should consume the same runtime surface as web where possible.

## Implementation

- Added a `workbench-host` runtime profile that combines Docker infra, host daemon, browser gateway, web URL, desktop renderer URL, and MCP roots.
- Extended runtime profile env rendering to produce daemon, browser gateway, Vite gateway, web, and desktop env values from the selected profile.
- Added `scripts/kirakira-workbench.mjs`, a dry-run friendly launcher that plans infra, daemon, web, and desktop startup from the same profile.
- Repointed root `start:daemon`, `start:web`, and `start:desktop` to the workbench launcher while retaining `dev:web` and `dev:desktop` as UI-only shortcuts.
- Updated `.env.example` so the documented Kirakira web port is `127.0.0.1:5183`, not the unrelated `5173` port.

## Validation

- `pnpm.cmd exec vitest run test/unit/runtime/profile-resolution.test.ts test/unit/scripts/workbench-launcher.test.ts`
- `pnpm.cmd runtime:profile show workbench-host`
- `pnpm.cmd runtime:profile env workbench-host`
- `node scripts/kirakira-workbench.mjs web --dry-run`
