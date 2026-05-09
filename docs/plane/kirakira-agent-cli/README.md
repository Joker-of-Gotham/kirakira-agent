# Kirakira Agent CLI — documentation plane

The **kirakira-agent** binary (`packages/cli`, `@kirakira/cli`) is the Kirakira Agent command-line interface for the **kirakira-agent-platform** monorepo. It orchestrates skills, MCP servers, plugins, registry access, sessions, traces, and policy-driven approvals on top of shared contracts in `@kirakira/core`.

## Quick start

From the repository root (`kirakira-agent-platform`):

```bash
pnpm install
pnpm build
pnpm exec kirakira-agent --help
```

The CLI entry re-exports oclif’s runner (`packages/cli/src/index.ts` → `@oclif/core` `run`). The binary is declared in `packages/cli/package.json` as `kirakira-agent`.

Common first steps:

1. **Initialize a workspace** — `kirakira-agent init` (see `packages/cli/src/commands/init.ts`).
2. **Run non-interactive execution** — `kirakira-agent exec -p "..."` with optional `--json` / `--jsonl` (`packages/cli/src/commands/exec.ts`).
3. **Check environment** — `kirakira-agent doctor` (`packages/cli/src/commands/doctor.ts`).

## Architecture summary

| Layer | Package | Role |
|--------|---------|------|
| Contracts | `@kirakira/core` (`packages/core`) | Zod schemas, TypeScript types, IDs, paths, lockfile I/O, errors |
| CLI | `@kirakira/cli` (`packages/cli`) | oclif commands, config load, parsers, approval, trace, registry HTTP client, output formatters |
| Skills | `@kirakira/skill-runtime` (`packages/skill-runtime`) | Discovery tiers, loader, validator, activator, trust, namespaces |
| MCP | `@kirakira/mcp-adapter` (`packages/mcp-adapter`) | Client, stdio/http/SSE-legacy transports OAuth/bearer/env auth |
| Compatibility | `@kirakira/compat` (`packages/compat`) | Per-host adapters, detector, normalizer, validator, security scan, pipeline |
| Models | `packages/model-gateway` | Python JSON-RPC gateway (client, mirrors, providers, health) |

Configuration merges defaults with workspace `agent.toml` and `policy.yaml` (`packages/cli/src/config/loader.ts`, `packages/core/src/schemas/config.ts`). Interactive input semantics (`/`, `@`, `!`) are implemented in `packages/cli/src/parser/`.

## Further reading

Use the numbered sections under this directory for deeper topics; each page cites concrete source paths in this repo.
