# Cursor compatibility

**Adapter:** `packages/compat/src/adapters/cursor.ts`.

## Scan API

`scanCursor(workspaceRoot)` returns:

- `skillPaths` — `.cursor/skills/**/SKILL.md`
- `commandPaths` — `.cursor/commands/**/*.{md,mdx}`
- `mcpJsonPaths` — `.cursor/mcp.json` if present, else falls back to workspace `.mcp.json`

## Helpers

`readJsonFile` loads raw JSON text for parser pipelines.

## Normalization

Cursor command markdown may become skills or slash palettes depending on manifest mapping inside `normalizer.ts`.

## MCP alignment

Because both `.cursor/mcp.json` and `.mcp.json` are scanned, prefer documenting **one** source of truth in team runbooks to prevent duplicate server entries post-normalization.

## Discovery overlap

Tier 3 globs in `discovery.ts` match the same Cursor directories, ensuring `kirakira-agent skill list` sees files the compat importer also understands.
