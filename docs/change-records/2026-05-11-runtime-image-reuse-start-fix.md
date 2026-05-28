# 2026-05-11 runtime image reuse start fix

## Request

`pnpm.cmd start` failed while building the Docker runtime image because Docker could not fetch a Docker Hub OAuth token for the base images. Startup should not be blocked by registry/network instability when a local runtime image already exists.

Follow-up correction: reusing the local image kept Docker online, but it also kept running stale `/app` build output from the old image. The startup path must run the current working tree's latest TUI/CLI build without requiring a Docker rebuild.

## Root cause

`scripts/kirakira.mjs` computed a source hash across most repository files and rebuilt `kirakira-agent-runtime:local` whenever that hash changed. Frontend/TUI edits therefore caused the next `pnpm.cmd start` to rebuild the whole runtime image.

That rebuild required Docker to resolve `node:22-bookworm` and `golang:1.23-bookworm` metadata from Docker Hub. When Docker Hub auth returned `EOF`, startup failed before the CLI could enter the interaction page, even though a usable local runtime image was already present.

## Files changed

- `.gitignore`
- `scripts/kirakira.mjs`

## Implementation

### Reuse local runtime image by default

Changed the startup policy so `pnpm.cmd start` reuses `kirakira-agent-runtime:local` whenever that image exists. If the current source hash differs from the image/cache hash, the script now prints a short warning and continues instead of forcing a rebuild.

Follow-up adjustment: the stale-image diagnostic is now hidden by default because the current workspace build is overlaid into the container. Set `KIRAKIRA_VERBOSE_STARTUP=1` to show it.

### Explicit rebuild controls

Runtime image rebuilds are now opt-in:

- `KIRAKIRA_REBUILD=1` or `KIRAKIRA_FORCE_BUILD=1` forces a rebuild.
- `KIRAKIRA_STRICT_IMAGE_HASH=1` restores strict source-hash behavior.
- `KIRAKIRA_SKIP_BUILD=1` disables automatic builds; if the image is missing, startup prints the manual build command and exits.
- `KIRAKIRA_SKIP_WORKSPACE_BUILD=1` skips the local workspace build and uses whatever `dist/` files already exist.
- `KIRAKIRA_FORCE_WORKSPACE_BUILD=1` forces the local workspace build even when the source hash cache matches.
- `KIRAKIRA_VERBOSE_STARTUP=1` shows runtime image reuse diagnostics.

On Windows PowerShell, use:

```powershell
$env:KIRAKIRA_REBUILD='1'; pnpm.cmd start
```

### Avoid implicit service rebuilds

When the installed Docker Compose supports it, runtime service startup now uses `docker compose up --no-build ...` so service boot does not unexpectedly trigger a build path after the image reuse decision has already been made.

### Mount current workspace build

Added a local workspace build step before launching the CLI container:

```powershell
pnpm.cmd exec turbo build --filter=@kirakira/cli...
```

The build is keyed by `.kirakira/workspace-build.hash`, so unchanged source trees skip it on later starts.

The new local cache file is ignored in `.gitignore`.

The CLI run container now receives read-only bind mounts for:

- every existing `packages/*/dist` directory
- every `packages/*/package.json`
- `scripts/kirakira-container.mjs`
- `scripts/kirakira-common.mjs`

This keeps the image's Linux dependency tree while replacing stale image build output with the current working tree's compiled code.

### Quiet Compose progress

Docker commands now default `COMPOSE_PROGRESS=quiet` unless the user already set it. This removes `Container ... Creating/Created` progress noise before the formal CLI page opens.

## Verification

```powershell
node --check scripts/kirakira.mjs
pnpm.cmd start -- --help
```

Observed result:

- `node --check` passed.
- `pnpm.cmd start -- --help` entered the Docker run path and printed CLI help.
- Startup reused the existing `kirakira-agent-runtime:local` image and did not print `Building Kirakira runtime image...`.
- The first run after the follow-up fix built the current workspace and wrote `.kirakira/workspace-build.hash`.
- A second `pnpm.cmd start -- --help` skipped the workspace build and no longer printed Docker Compose container creation progress.
