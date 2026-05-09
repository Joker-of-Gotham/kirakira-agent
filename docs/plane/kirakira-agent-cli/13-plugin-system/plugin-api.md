# Plugin API surface

## Command plugins

Implement `CommandLikePlugin`:

- `kind: "command"`
- `meta: PluginMeta`
- `mount(registry: CommandRegistry)` registers `CommandHandler` / `SlashHandler` entries (`types/plugin.ts` in core + `cli/src/plugin/types.ts`)

## Import adapter plugins

`ImportAdapterLike` exposes:

- `adapter.detect(DetectInput): Promise<DetectResult>`
- `adapter.normalize(NormalizeInput): Promise<NormalizedArtifact>`

Matches the compat pipeline inputs (`packages/compat/src/pipeline.ts`) but allows third-party formats.

## Renderer plugins

`RendererLike` implements `RendererAdapter.format(OutputEvent): string` to override human/JSONL presentation (`cli/src/plugin/types.ts`).

## Registry plugins

`LoadedPlugin` union includes `{ kind: "registry"; baseUrl: string; ... }` for alternate package backends compatible with `RegistryClient` routes (`registry/client.ts`).

## Sandbox hooks

`defaultSandboxPolicy(kind)` returns booleans for FS read/write, network, child processes—enforce before loading untrusted plugin code.
