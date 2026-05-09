# Skill trust model

Trust levels are first-class enums in **`skillManifestSchema`** (`packages/core/src/schemas/skill.ts`):

- `internal-signed`
- `enterprise-allow`
- `user-approved`
- `ask`
- `untrusted`

MCP servers mirror the same set in `mcpTrustLevel` (`packages/core/src/schemas/mcp.ts`).

## Heuristic evaluation

`evaluateSkillTrust` / `inferTrustForPath` (`packages/skill-runtime/src/trust.ts`) inspect frontmatter plus coarse signals (e.g. presence of scripts directory, risky patterns in file contents). Returned **`TrustEvaluation`** includes:

- `level`
- `needsTrustPrompt`
- `reasons[]` for UI / logs

## Policy coupling

`policy.yaml` `skills.allowExternalScripts` and `allowAllowedToolsField` gate whether elevated tooling fields are accepted (`packages/core/src/schemas/config.ts`). Mismatches should surface as `SkillValidationError` or approval prompts, not silent drops.

## Registry trust

Publishing flows (`packages/cli/src/commands/registry/publish.ts` + `RegistryClient.publish`) attach package metadata; consumers merge registry `TrustEntry` records (`packages/cli/src/registry/client.ts` `trust()` method) with local heuristics.

## User approvals

When `needsTrustPrompt` is true, the interactive layer should build `SkillScriptApproval` cards (see `packages/core/src/types/approval.ts`) and route through `processApprovalDecision` (`packages/cli/src/approval/decision.ts`).
