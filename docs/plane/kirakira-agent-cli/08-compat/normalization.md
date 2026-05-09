# Normalization pipeline

**Orchestrator:** `packages/compat/src/pipeline.ts` exports `ImportPipelineResult` with:

- `detected` — `detectPlatforms(workspaceRoot)`
- `manifest` — `UnifiedImportManifest` (`skills`, `mcp`)
- `validation` — `validateManifests` output
- `security` — `SecurityFinding[]`
- `trustPrompt` — `formatTrustPrompt` string for UX

## Stages

1. **Detect** — `detectPlatforms` (`detector.ts`) enumerates present vendor layouts.
2. **Collect** — `collectScans` runs `scanClaude`, `scanCodex`, `scanCursor`, `scanCopilot`, `scanGemini` in parallel where async.
3. **Normalize** — `normalizeImport` (`normalizer.ts`) converts raw files into typed **`SkillManifest`** + **`McpManifest`** arrays using `@kirakira/core` `SCHEMA_VERSIONS` and parsers (e.g. `mcpConfigFileSchema.safeParse`).
4. **Validate** — `validateManifests` (`validator.ts`) produces `ValidationResult` with issues.
5. **Security** — `scanImportedConfig` (`security-scanner.ts`) inspects risky URL patterns, secrets, etc.
6. **Trust** — `formatTrustPrompt` (`trust-prompt.js`) explains risk to humans before importing.

Raw MCP JSON text is threaded through `collectRawTexts` for scanners.

## CLI usage

Skill/MCP import commands (`packages/cli/src/commands/skill/import.ts`, `mcp/import.ts`) should wrap this pipeline to ensure a single code path.
