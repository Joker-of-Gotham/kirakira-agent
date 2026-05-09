# Skills system

Skills are markdown documents (`SKILL.md`) with YAML frontmatter, discovered tier-by-tier, validated, activated by task text, and executed with trust and policy constraints.

## Packages

- **`@kirakira/core`** — Frontmatter + manifest schemas (`packages/core/src/schemas/skill.ts`), types (`types/skill.ts`).
- **`@kirakira/skill-runtime`** — Discovery (`discovery.ts`), index builder (`index-builder.ts`), loader (`loader.ts`), validator (`validator.ts`), activator (`activator.ts`), trust heuristics (`trust.ts`), namespaces (`namespace.ts`).
- **`@kirakira/cli`** — User commands under `packages/cli/src/commands/skill/`.

## Lifecycle (summary)

See [lifecycle](./lifecycle.md). Operational flow:

**discover** → **index** (metadata) → **activate** (pattern match) → **load** (parse body) → **execute** (tools/scripts under policy).

## Related docs

- [SKILL.md spec](./skill-md-spec.md)
- [Discovery tiers](./discovery.md)
- [Lifecycle](./lifecycle.md)
- [Trust](./trust.md)
