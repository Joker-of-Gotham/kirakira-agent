# Test pyramid

## Unit

Target pure functions with minimal I/O:

- `routeInput`, `parseSlashInput`, `parseShellInput`, `classifyMentionToken` (`packages/cli/src/parser/`)
- `shouldActivateSkill` (`packages/skill-runtime/src/activator.ts`)
- `processApprovalDecision` (`packages/cli/src/approval/decision.ts`)
- `evaluateSkillTrust` (`packages/skill-runtime/src/trust.ts`)

## Integration

Spawn short-lived processes or temporary dirs:

- `parseAgentToml` / `parsePolicyYaml` with fixture files
- `loadConfig` merge semantics (`packages/cli/src/config/loader.ts`)
- `RegistryClient` against a reachable registry URL using real HTTP requests (`registry/client.ts`)

## Contract

Snapshot JSON Schema/Zod outputs:

- `execResultSchema`, `outputEventSchema` (`packages/core/src/schemas/output.ts`)
- `mcpConfigFileSchema` (`schemas/mcp.ts`)

## Security

Fuzz path helpers (`isPathWithin`), shell policy matcher, and compat `security-scanner.ts` findings.

Run locally via `pnpm test:unit` / `pnpm test:integration` once suites exist.
