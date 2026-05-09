# Monorepo organization

## pnpm workspace

The workspace is declared in `pnpm-workspace.yaml`:

```yaml
packages:
  - packages/*
```

The root `package.json` (`kirakira-agent-platform`) sets `"packageManager": "pnpm@10.8.0"` and `"engines": { "node": ">=20.0.0" }`. Internal packages reference each other with `workspace:*` (see `packages/cli/package.json` → `@kirakira/core`).

## Turborepo

`turbo.json` defines the task graph:

- **`build`** — Depends on upstream `^build`; outputs go to `dist/**` per package.
- **`typecheck` / `lint`** — Depend on `^build` so declaration files exist.
- **`test`** — Depends on `build`; may emit `coverage/**`.
- **`dev`** — Uncached, persistent tasks for watch mode.
- **`clean`** — Uncached cleanup.

Run `pnpm build` at the root to compile all packages in dependency order.

## Package structure (TypeScript)

Each TS package typically contains:

- `src/` — Source (e.g. `packages/cli/src/commands/`, `packages/core/src/schemas/`).
- `tsconfig.json` — Project references as needed.
- Build output — `dist/` produced by `tsup` (CLI) or equivalent (`packages/cli/package.json` `build` script).

Python code for the model gateway lives under `packages/model-gateway/src/kirakira_model_gateway/` with standard `pyproject`-style packaging (see individual modules: `server.py`, `client.py`, etc.).

## Binaries and oclif

`@kirakira/cli` exposes the `kirakira-agent` binary (`packages/cli/package.json` `"bin"` and `"oclif"` block). Commands are discovered from `./dist/commands` using oclif’s pattern strategy—see `packages/cli/src/commands/` for the authoritative command tree.
