# Plugin development guide

## 1. Scaffold a package

Create a directory under `~/.kirakira/plugins/<your-plugin>` or `<workspace>/.kirakira/plugins/<your-plugin>` with:

- `package.json` pointing `main` at an ESM module
- `kirakira-plugin.json` (optional manifest) describing `PluginMeta`

## 2. Implement the correct interface

Choose a kind from `PluginKind` (`packages/core/src/types/plugin.ts`) and export a factory used by the CLI loader (`packages/cli/src/plugin/loader.ts` — remainder of file after `discoverPluginPaths`).

## 3. Use core contracts

Import types/schemas from `@kirakira/core` rather than duplicating JSON shapes—especially `OutputEvent`, `DetectInput`, `NormalizeInput`.

## 4. Respect sandbox policies

Callers should wrap plugin execution with permissions derived from `defaultSandboxPolicy` (`cli/src/plugin/types.ts`); avoid `execa` unless `allowChildProcesses` is true.

## 5. Test locally

- Run `pnpm build` inside the monorepo, then `kirakira-agentPlugin install` (command wiring pending) or symlink for development.
- Validate with `kirakira-agent plugin list` and concrete commands that exercise each registration path.

## 6. Publish

Enterprise teams may distribute plugins via internal npm scope or registry tarball (`RegistryClient.publish`).

## 7. Security review checklist

- No secrets in manifests
- Network destinations documented
- Renderer plugins must not execute arbitrary code from tool output
