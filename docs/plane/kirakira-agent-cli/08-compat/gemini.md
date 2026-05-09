# Gemini compatibility

**Adapter:** `packages/compat/src/adapters/gemini.ts`.

## Scan

`scanGemini(workspaceRoot)` collects settings files (paths recorded in scan object consumed by `pipeline.ts`). Binary/IDE settings often include nested MCP JSON blobs.

## Parsing

`readSettingsJson` + `parseGeminiMcpServers` extract MCP endpoints compatible with `@kirakira/core` manifests, similar to other adapters.

## Normalization

Skills originating from Gemini exports should use `imported-gemini` `SkillSourceType` when building manifests (`schemas/skill.ts`).

## Model gateway note

The Python **model gateway** (`packages/model-gateway/src/kirakira_model_gateway/`) can serve Gemini-compatible providers via `create_provider` (`provider.py`)—separate from skills import but part of end-to-end Gemini enablement.
