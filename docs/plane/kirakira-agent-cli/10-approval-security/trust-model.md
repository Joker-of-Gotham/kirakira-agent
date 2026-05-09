# Trust levels

## Skills and MCP

**Skills** — `skillTrustLevel` enum inside `skillManifestSchema` (`packages/core/src/schemas/skill.ts`):

`internal-signed`, `enterprise-allow`, `user-approved`, `ask`, `untrusted`

**MCP** — `mcpTrustLevel` inside MCP schemas (`schemas/mcp.ts`) uses the same labels for servers/tools.

## Meaning

| Level | Typical use |
|-------|-------------|
| `internal-signed` | Built org artifacts signed by corporate key |
| `enterprise-allow` | Allowlisted publisher list (registry `/v1/trust`) |
| `user-approved` | Operator explicitly trusted |
| `ask` | Requires interactive approval |
| `untrusted` | Default for unknown imports |

## Heuristic inference

`evaluateSkillTrust` (`packages/skill-runtime/src/trust.ts`) may downgrade/upgrade with reasons for UI.

## Approvals vs trust

Trust answers *“who vouches for this package?”*; approvals answer *“may this specific action run right now?”* (`evaluator.ts`).

## Configuration

`agent.toml` `trust` sets workspace baseline; `policy.yaml` `workspaceTrust` can reinforce org stance. Compat imports should assume `untrusted` until promoted.
