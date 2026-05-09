# Skill discovery (five tiers)

**`discoverSkillEntries`** in `packages/skill-runtime/src/discovery.ts` enumerates `SKILL.md` (and Cursor command docs) with integer **tiers**—lower numbers win on duplicates (`Map` keeps minimum tier per path).

## Tier table (code comments)

| Tier | Location | Pattern / root |
|------|-----------|----------------|
| 1 | Workspace | `.kirakira/skills/**/SKILL.md` |
| 2 | Lockfile packages | `kirakira.lock` entries with `file:` sources pointing at on-disk skill dirs (`SKILL.md` must exist) |
| 3 | Compatibility dirs | `.claude/skills`, `.agents/skills`, `.cursor/skills`, `.cursor/commands/*.{md,mdx}` |
| 4 | User home | `~/.kirakira/skills/**/SKILL.md` when directory exists |
| 5 | System | `/etc/kirakira/skills/**/SKILL.md` when directory exists |

`fast-glob` runs per `{ pattern, tier, cwd }`, merges into `byPath`, sorts by tier then path.

## Public helpers

- **`discoverSkillEntries(workspaceRoot)`** → `{ path, tier }[]`
- **`discoverSkills(workspaceRoot)`** → `SkillMeta[]` via `buildSkillIndex` (`index-builder.ts`)

## CLI discovery hints

`SKILL_DISCOVERY_DIRS` in `packages/core/src/constants.ts` mirrors commonly scanned relative dirs for documentation parity.

## Cross-package usage

Compat adapters (e.g. `packages/compat/src/adapters/claude.ts`) may feed additional roots before normalization; pipeline orchestration is in `packages/compat/src/pipeline.ts`.
