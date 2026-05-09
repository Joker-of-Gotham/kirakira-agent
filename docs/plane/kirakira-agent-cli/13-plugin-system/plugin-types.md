# Plugin types and capabilities

`PluginKind` — `packages/core/src/types/plugin.ts`:

| Kind | Purpose | Default sandbox (`defaultSandboxPolicy`) |
|------|---------|------------------------------------------|
| `command` | Adds CLI + slash handlers | FS read only |
| `import-adapter` | Detect/normalize foreign artifacts | FS read + network |
| `renderer` | Formats output events | FS read only |
| `registry` | Alternate registry host | FS read + network |

## Restrictions

- Command plugins **cannot** spawn child processes or write arbitrary FS paths unless policy is escalated deliberately in `sandbox.ts`.
- Registry plugins must honor org TLS inspection and `RegistryError` semantics when emitting failures.

## Metadata

`PluginMeta` tracks `name`, `version`, `kind`, `enabled`, `path` for `plugin list` (`commands/plugin/list.ts`).

## Feature toggles

Admins disable risky kinds centrally via enterprise config (extend `policy.yaml` as product matures).
