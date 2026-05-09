# Foundation layer

The foundation ties the monorepo together: **pnpm workspaces**, **Turborepo** task graph, **TypeScript** builds, and the **`@kirakira/core`** contract package that every other package imports.

## What lives here

- **Repository tooling** — Root `package.json` defines `build`, `test`, `lint`, and `typecheck` via `turbo run`. See `turbo.json` for task dependencies (`build` depends on `^build`, `test` depends on `build`).
- **Workspace boundary** — `pnpm-workspace.yaml` lists `packages/*`, so `packages/core`, `packages/cli`, `packages/skill-runtime`, `packages/mcp-adapter`, `packages/compat`, and `packages/model-gateway` are first-class members.
- **Shared contracts** — All JSON/TOML/YAML shapes and error bases are centralized in `packages/core` so CLI, skill-runtime, and adapters agree on parsing and typing.

## Package map

| Path | npm name | Purpose |
|------|-----------|---------|
| `packages/core` | `@kirakira/core` | Schemas, types, utils, lockfile |
| `packages/cli` | `@kirakira/cli` | User-facing `kirakira-agent` |
| `packages/skill-runtime` | `@kirakira/skill-runtime` | Skill discovery and execution helpers |
| `packages/mcp-adapter` | `@kirakira/mcp-adapter` | MCP wire-up |
| `packages/compat` | `@kirakira/compat` | Import from Claude/Codex/Cursor/Copilot/Gemini |
| `packages/model-gateway` | (Python) | Model completions over stdio |

## Related docs

- [Monorepo layout](./monorepo.md)
- [Type contracts](./type-contracts.md)
- [Error handling](./error-handling.md)
