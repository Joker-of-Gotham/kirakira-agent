# 2026-05-09 Single Runtime Path

## Problem

The project could be started in several different ways:

- Direct local CLI execution through Node and pnpm scripts.
- Docker Compose execution.
- Manual MCP changes through TUI slash commands followed by restart.
- Direct `docker compose` invocations for diagnostics.

That made failures hard to reproduce because local execution, container execution, service health, MCP server installation, and tool discovery could all take different paths.

## Goal

The supported operator path is now:

```powershell
pnpm start
```

The same entrypoint is also used for management commands:

```powershell
pnpm start -- mcp list
pnpm start -- mcp tools
pnpm start -- mcp add <package>
```

Internally, that path always uses Docker Compose. Local Node execution remains a development implementation detail, not the operator-facing runtime.

## Files Changed

- `.mcp.json`
- `Dockerfile`
- `docker-compose.yml`
- `package.json`
- `scripts/kirakira-common.mjs`
- `scripts/kirakira-container.mjs`
- `scripts/kirakira.mjs`
- `packages/cli/src/commands/mcp/add.ts`
- `packages/cli/src/commands/mcp/call.ts`
- `packages/cli/src/commands/mcp/index.ts`
- `packages/cli/src/commands/mcp/list.ts`
- `packages/cli/src/commands/mcp/start.ts`
- `packages/cli/src/commands/mcp/tools.ts`
- `packages/cli/src/tui/App.tsx`
- `packages/cli/src/tui/hooks/useMcp.ts`
- `packages/cli/src/tui/hooks/useSlash.ts`
- `docs/change-records/2026-05-09-single-runtime-path.md`

## Implementation Details

### Host entrypoint

`package.json` now routes the operator-facing start command to:

```text
node scripts/kirakira.mjs
```

The host entrypoint performs the complete bootstrap:

1. Checks Docker Compose availability.
2. Ensures `.env` exists.
3. Normalizes `.mcp.json`.
4. Computes a source hash for the runtime inputs.
5. Builds the shared runtime image only when the image is missing or stale.
6. Labels the runtime image with the source hash after build.
7. Runs the requested command through Docker Compose.
8. Defaults to the interactive chat command when no subcommand is provided.

This means `pnpm start` is the single supported way to enter the formal interactive UI.

The source hash covers the runtime build surface:

- `Dockerfile`
- `docker-compose.yml`
- root package and TypeScript config files
- `packages/`
- `policies/`
- `scripts/`

Generated directories such as `dist`, `.turbo`, and `node_modules` are ignored.

### Container entrypoint

`Dockerfile` now uses:

```text
node /app/scripts/kirakira-container.mjs
```

The container entrypoint normalizes MCP config from inside the container and then launches the CLI. This keeps host and container behavior aligned.

### Compose runtime

`docker-compose.yml` now defines one shared Kirakira runtime image:

```yaml
x-kirakira-runtime:
  image: kirakira-agent-runtime:local
```

Both `kirakirad` and `kirakira-agent` use that runtime image. The policy daemon is still a separate service, but it is no longer built through a separate runtime path.

The runtime image is labeled with:

```text
org.kirakira.source-hash
```

`pnpm start` compares this label with the current source hash and skips Docker build when they match. This prevents ordinary management commands from rebuilding the image every time.

Docker build and runtime `npx` package installation use one registry setting:

```text
NPM_CONFIG_REGISTRY
```

The default is `https://registry.npmmirror.com` because the local Docker build repeatedly failed against `registry.npmjs.org` with `ECONNRESET`. The value is still overridable through the environment before running `pnpm start`.

The agent service mounts the repository at `/workspace` and uses container-native service URLs:

- `KIRAKIRA_PDP_ENDPOINT=tcp://kirakirad:17777`
- `DATABASE_URL=postgres://kirakira:kirakira@postgres:5432/kirakira`
- `REDIS_URL=redis://redis:6379`
- `QDRANT_URL=http://qdrant:6333`
- `NEO4J_URI=bolt://neo4j:7687`
- `S3_ENDPOINT=http://minio:9000`

### Canonical MCP configuration

`scripts/kirakira-common.mjs` owns the canonical MCP config. The managed default set is:

- `filesystem-core`
- `filesystem-search`
- `filesystem-git`
- `filesystem-patch`
- `filesystem-artifact`
- `memory`
- `github`

The old duplicate `filesystem` server is removed during normalization. The container MCP paths now use `/workspace` and `/app/.../dist/index.js`, so MCP servers run in the same environment as the agent.

Custom user MCP servers are preserved unless they collide with a managed canonical name.

### MCP management path

CLI help and examples now point to:

```powershell
pnpm start -- mcp ...
```

TUI `/mcp add` now maps the official filesystem package to `filesystem-core` instead of creating another duplicate `filesystem` entry. The filesystem default path is the active workspace root, so container execution writes `/workspace` instead of a host-only path. After writing `.mcp.json`, it reloads MCP servers and the tool cache in the running UI instead of requiring an opaque restart.

`/mcp refresh` now reloads the MCP servers and tool cache, not just the cached tool list.

## Verification Performed

Type checking:

```powershell
pnpm.cmd --filter @kirakira/cli typecheck
pnpm.cmd --filter @kirakira/mcp-adapter typecheck
```

Both passed.

CLI build:

```powershell
pnpm.cmd --filter @kirakira/cli build
```

Passed.

Runtime image build:

```powershell
docker compose --progress plain build kirakira-agent
```

Passed after switching pnpm installation away from Corepack and setting the default registry to `https://registry.npmmirror.com`.

Single entrypoint server listing:

```powershell
pnpm.cmd start -- mcp list
```

Observed result:

```text
MCP Servers (7):
  filesystem-core (stdio)
  filesystem-search (stdio)
  filesystem-git (stdio)
  filesystem-patch (stdio)
  filesystem-artifact (stdio)
  memory (stdio)
  github (stdio)
```

The final `pnpm.cmd start -- mcp list` run returned in 4.4 seconds after the runtime image hash matched and the build step was skipped.

Single entrypoint tool startup:

```powershell
pnpm.cmd start -- mcp tools
```

Observed result:

```text
MCP Gateway - 95 tools from 7 servers

  filesystem-core      healthy
  filesystem-search    healthy
  filesystem-git       healthy
  filesystem-patch     healthy
  filesystem-artifact  healthy
  memory               healthy
  github               healthy
```

The final `pnpm.cmd start -- mcp tools` run returned in 23.6 seconds after the runtime image hash matched and the build step was skipped.

## Operational Notes

The first `pnpm start` after Docker cache invalidation can take several minutes because the runtime image fetches dependencies and builds all workspace packages. Later runs skip the Docker build when the source hash matches the image label.

The supported operator commands are intentionally narrow:

```powershell
pnpm start
pnpm start -- mcp list
pnpm start -- mcp tools
pnpm start -- mcp add <package>
pnpm start -- mcp remove <name>
```

Direct `node packages/cli/bin/run.js ...` and direct `docker compose run ...` are now development/debugging internals, not the normal usage path.
