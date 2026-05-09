# Codex compatibility

**Adapter:** `packages/compat/src/adapters/codex.ts`.

## Detection

`detectPlatforms` looks for `.agents/skills` and `.codex/config.toml` (`detector.ts`).

## Configuration

Codex stores MCP and agent settings in **`config.toml`**. Normalizer helpers:

- `readCodexToml`
- `parseCodexMcpServers`

These map Toml tables into `McpServerEntry` / manifest structures consumed by `normalizeImport` (`normalizer.ts`).

## Skills

Skill markdown under `.agents/skills` is also scanned by **tier 3** discovery (`discovery.ts` glob `.agents/skills/**/SKILL.md`).

## Import notes

When importing into Kirakira manifests, source type should reflect `imported-codex` (see `skillSourceType` union in `packages/core/src/schemas/skill.ts`) for provenance.
