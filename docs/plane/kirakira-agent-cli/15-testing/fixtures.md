# Test fixtures (planned layout)

Recommended directory: `tests/fixtures/` at repo root (or colocated `__fixtures__/` per package) checked into git **without secrets**.

## Config fixtures

- Minimal valid `agent.toml` covering each schema section (`packages/core/src/schemas/config.ts`)
- `policy.yaml` variants for shell host allow/deny/ask permutations
- `.mcp.json` samples for `stdio`, `http`, `sse_legacy` (negative tests)

## Skill fixtures

- `SKILL.md` with frontmatter edge cases (`allowed-tools` string vs array)
- Broken skills missing scripts to exercise `validateSkill`

## Session / output fixtures

- Golden JSONL transcripts using `SessionEvent` types
- `exec --json` envelopes matching `execJsonEnvelopeSchema`

## Registry fixtures

- Recorded **real** registry JSON responses (from a dev/staging server) for `/v1/search`, `/v1/resolve`, stored with commit hashes — never fabricated HTTP bodies.

## Compat fixtures

Synthetic `.claude`, `.cursor`, `.codex`, Copilot, Gemini tree snippets mirroring `compat/src/adapters/*`.

## Maintenance

When schemas bump (`SCHEMA_VERSIONS` in `packages/core/src/constants.ts`), update fixtures in the same commit.
