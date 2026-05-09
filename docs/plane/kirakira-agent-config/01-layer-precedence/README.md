# Layer Precedence

## Load Order

| Priority | Layer | Path | Purpose |
|----------|-------|------|---------|
| 1 (lowest) | System | `/etc/kirakira/agent.toml` | Organization-wide defaults |
| 2 | User | `~/.kirakira/config.toml` | User preferences |
| 3 | Repo | `./agent.toml` | Repository-level settings (committed) |
| 4 (highest) | Workspace | `./.kirakira/local.toml` | Local overrides (gitignored) |

## Resolution Rules

- Each layer is optional; missing layers are skipped
- All TOML files are parsed with `smol-toml` and validated against `agentTomlSchema`
- Environment variables (`${VAR:-default}`) are expanded at each layer
- The final merged config includes a `layers` array for provenance tracking
