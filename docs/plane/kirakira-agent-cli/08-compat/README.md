# Five-platform compatibility (`@kirakira/compat`)

The compat package imports skills and MCP settings from **Claude**, **Codex**, **Cursor**, **Copilot**, and **Gemini** layouts into **`UnifiedImportManifest`** structures that match `@kirakira/core` schemas.

## Entry points

- **`detectPlatforms`** — `packages/compat/src/detector.ts` checks which vendor dirs/files exist.
- **`runImportPipeline` / pipeline** — `packages/compat/src/pipeline.ts` orchestrates scan → normalize → validate → security → trust prompt.
- **Normalizer** — `packages/compat/src/normalizer.ts` builds `SkillManifest[]` + `McpManifest[]`.
- **Validator** — `packages/compat/src/validator.ts` aggregates `ValidationResult`.
- **Security scanner** — `packages/compat/src/security-scanner.ts` emits `SecurityFinding[]`.
- **Trust prompt** — `packages/compat/src/trust-prompt.ts` produces human-readable summaries.

## Adapters

| Platform | Module |
|----------|--------|
| Claude | `adapters/claude.ts` |
| Codex | `adapters/codex.ts` |
| Cursor | `adapters/cursor.ts` |
| Copilot | `adapters/copilot.ts` |
| Gemini | `adapters/gemini.ts` |

## Feature flags

`agent.toml` `compat.read_*` booleans (`packages/core/src/schemas/config.ts`) gate optional readers.

## Related docs

Per-vendor pages and [normalization pipeline](./normalization.md).
