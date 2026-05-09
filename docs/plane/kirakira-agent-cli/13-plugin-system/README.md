# Plugin system

Plugins extend the CLI with **custom commands**, **import adapters**, **renderers**, and **registry backends** without forking core.

## Discovery

`discoverPluginPaths` (`packages/cli/src/plugin/loader.ts`) scans:

- `~/.kirakira/plugins/<name>`
- `<workspace>/.kirakira/plugins/<name>`

(`PATHS.userPlugins` in `packages/core/src/constants.ts`.)

## Registration runtime

`packages/cli/src/plugin/registry.ts` maintains loaded plugins; `sandbox.ts` enforces filesystem/network/process policy per kind.

## Types

`packages/cli/src/plugin/types.ts` defines `LoadedPlugin` variants and **`defaultSandboxPolicy`** capabilities table.

## Core contracts

`PluginKind`, `PluginMeta`, `CommandRegistry`, detect/normalize structs — `packages/core/src/types/plugin.ts`.

## CLI commands

`packages/cli/src/commands/plugin/` (`list`, `install`, `enable`, `disable`, `update`).

## Related docs

- [Plugin API](./plugin-api.md)
- [Plugin types](./plugin-types.md)
- [Development guide](./development-guide.md)
