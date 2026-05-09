# SKILL.md specification

## Frontmatter

Validated by **`skillFrontmatterSchema`** (`packages/core/src/schemas/skill.ts`):

| Field | Requirement | Notes |
|-------|-------------|-------|
| `name` | required string | Stable id |
| `description` | required string | Shown in listings |
| `version` | optional | Semver string |
| `compatibility` | optional | Host constraints |
| `owner` | optional | Team or user |
| `allowed-tools` | optional string or string[] | Mapped to `allowedTools` in loader |
| `activation` | optional string[] | Substring / `*` glob patterns (`activator.ts`) |
| `risk_level` | optional | Free-form hint |
| `requires_approval_for` | optional string[] | Fine-grained approvals |
| `metadata` | optional record | Extensibility |

## Body

The markdown body is Markdown prose plus optional links. **`loadSkill`** (`packages/skill-runtime/src/loader.ts`) uses `gray-matter` to split frontmatter/body and lazily `materialize()` full `SkillContent`.

## Scripts and references

`extractScriptsAndReferences` walks markdown links `](path)`:

- Remote `http(s)` → **references**
- Paths containing `scripts/` or ending in executable extensions → **scripts**
- Other relative paths → **references**

This feeds **`skillManifestSchema.files`** when producing manifests (`scripts[]`, `references[]`).

## Validation

`validateSkill` (`validator.ts`) ensures scripts exist on disk relative to the skill directory and collects `ValidationIssue` lists (`@kirakira/core` types).

## Manifest

`skillManifestSchema` describes normalized registry-ready metadata: `source`, `trust`, `activation` modes (`auto-or-explicit`, `explicit-only`, `auto`), `compat.format`, etc.
