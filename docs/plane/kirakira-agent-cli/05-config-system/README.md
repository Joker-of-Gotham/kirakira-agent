# Config system

Configuration merges **defaults**, **workspace files**, and optional **CLI overrides**. Parsing and validation use Zod schemas from `@kirakira/core` and filesystem discovery in `packages/cli/src/config/`.

## Key modules

| File | Role |
|------|------|
| `paths.ts` | `resolveConfigPaths` — locates `agent.toml`, `policy.yaml`, `.kirakira/local.toml`, user `~/.kirakira/config.toml` |
| `defaults.ts` | Baseline objects before merge |
| `agent-toml.ts` | Parse TOML + `envExpand` + `agentTomlSchema` |
| `policy-yaml.ts` | Parse YAML + `envExpand` + `policyYamlSchema` |
| `loader.ts` | `loadConfig` deep-merges agent + policy into `ResolvedConfig` |

## Path constants

`PATHS` in `packages/core/src/constants.ts` defines relative filenames: `agent.toml`, `policy.yaml`, `.kirakira/local.toml`, `.mcp.json`, user home `.kirakira/` subtree.

## Related docs

- [agent.toml reference](./agent-toml.md)
- [policy.yaml reference](./policy-yaml.md)
- [Precedence](./precedence.md)
