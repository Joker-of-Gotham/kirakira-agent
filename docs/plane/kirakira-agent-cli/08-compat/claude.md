# Claude Code compatibility

**Adapter:** `packages/compat/src/adapters/claude.ts` (imported by `pipeline.ts` and `normalizer.ts`).

## Detection

`detectPlatforms` marks **claude** when `.claude/skills`, `.claude/commands`, `.mcp.json`, or `.claude.json` exists under the workspace (`detector.ts`).

## Scan surface

`scanClaude` returns paths for:

- Skill/command markdown trees
- MCP configuration files (reader helpers like `readMcpConfigFile`)

## Normalization

`normalizer.ts` reads `SKILL.md` bodies via `gray-matter`, assigns `SkillSourceType` values such as `imported-claude`, and converts MCP JSON through `mcpConfigFileSchema` validation from `@kirakira/core`.

## CLI alignment

Discovery tier 3 explicitly globs `.claude/skills/**/SKILL.md` (`packages/skill-runtime/src/discovery.ts`) so native + imported layouts stay consistent.

## MCP

Shared `.mcp.json` may be consumed by both Claude and generic MCP commands—keep one canonical file to avoid drift.
