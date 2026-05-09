# Skill lifecycle

This lifecycle maps runtime modules under `packages/skill-runtime/src/` to operational stages.

## 1. Discover

`discoverSkillEntries` / `discoverSkills` (`discovery.ts`) produce candidate paths + tiers, then `buildSkillIndex` builds **`SkillMeta`** records (name, path, tier, trust hints).

## 2. Index

The index step deduplicates by path, orders by tier, and attaches metadata needed for listings (`kirakira-agent skill list/search` → `packages/cli/src/commands/skill/`).

## 3. Activate

`shouldActivateSkill` (`activator.ts`) checks user prompt text against `activation` patterns from frontmatter:

- Plain substring match (lowercased)
- Glob with `*` → regex anchor

No patterns → skill never auto-activates (explicit invocation path only).

## 4. Load

`loadSkill(path)` (`loader.ts`):

1. Reads file, parses frontmatter via `gray-matter`.
2. Validates frontmatter with `skillFrontmatterSchema`.
3. Returns `{ path, frontmatter, materialize() }` for lazy body + script extraction.

## 5. Validate

`validateSkill` (`validator.ts`) checks required fields, verifies linked scripts exist, emits warnings/errors (`ValidationResult`).

## 6. Execute

Execution is host-dependent (tool runner, MCP, shell). Approvals consult:

- Trust evaluation (`trust.ts`)
- Policy YAML `skills` section (`packages/core/src/schemas/config.ts`)
- Approval cards (`packages/core/src/types/approval.ts`)

Namespaces (`namespace.ts`) isolate skill ids across sources when multiple hosts import definitions.
