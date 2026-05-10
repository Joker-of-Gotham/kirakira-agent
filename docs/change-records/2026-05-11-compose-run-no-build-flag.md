# Docker Compose run flag compatibility fix

Date: 2026-05-11

## Problem

`pnpm.cmd start` built the runtime image successfully, then failed before entering the Kirakira interaction UI:

```text
unknown flag: --no-build
ELIFECYCLE Command failed with exit code 1.
```

The failure happened after `kirakira-agent-runtime:local` was built. This means the Docker image build was not the broken step. The broken step was the final `docker compose run` invocation assembled by `scripts/kirakira.mjs`.

## Root cause

`scripts/kirakira.mjs` passed `--no-build` to `docker compose run`.

The installed Docker Compose CLI reports:

```text
Docker Compose version v5.1.0
```

For this version, `docker compose run --help` exposes `--build`, `--no-deps`, `--pull`, and other run flags, but not `--no-build`. `--no-build` is therefore rejected before the CLI container can start.

## Change

Updated `scripts/kirakira.mjs`:

- Removed the unsupported `--no-build` flag from the `docker compose run` path.
- Added `--pull never` so the final interactive container uses the local runtime image produced by the Kirakira startup script instead of trying to pull a remote image.

The build/no-build decision remains owned by `ensureRuntimeImage()` in `scripts/kirakira.mjs`, which compares the computed source hash against `.kirakira/runtime-image.hash` and the Docker image label `org.kirakira.source-hash`.

## Expected behavior

`pnpm.cmd start` now follows this single path:

1. Ensure `.env` and MCP config exist.
2. Build `kirakira-agent-runtime:local` only when the source hash changes.
3. Start runtime services with `docker compose up -d --wait`.
4. Enter the formal Kirakira TUI through `docker compose run --rm --no-deps --pull never kirakira-agent chat`.

## Verification

Passed after code change:

- `node --check scripts\kirakira.mjs`
- `docker compose run --rm --no-deps --pull never -T kirakira-agent --help`
- `pnpm.cmd start -- --help`
