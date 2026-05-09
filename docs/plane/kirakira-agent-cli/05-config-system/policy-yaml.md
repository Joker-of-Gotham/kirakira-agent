# `policy.yaml` schema

Authoritative Zod schema: **`policyYamlSchema`** in `packages/core/src/schemas/config.ts`. Parser entry: **`parsePolicyYaml`** in `packages/cli/src/config/policy-yaml.ts` (uses `yaml` package, `envExpand`, detailed `ConfigError` messages).

## Top level

| Field | Type | Notes |
|-------|------|-------|
| `schemaVersion` | positive int | Required |
| `workspaceTrust` | `"trusted"` \| `"untrusted"` \| `"ask"` | Optional override |

## `shell`

- `hostExecution` — `"allow"` \| `"deny"` \| `"ask"` (matches `! --host` risk)
- `allowlist` / `denylist` — string arrays for command pattern governance

Used by approval evaluation (`packages/cli/src/approval/policy-matcher.ts`) alongside session allowlists (`session-allowlist.ts`).

## `mcp`

- `allowRemoteHttp` (bool)
- `allowLegacySse` — `"allow"` \| `"deny"` \| `"ask"` for SSE transports
- `approvedServers` — string allowlist

Mirrors transport enums in `packages/core/src/schemas/mcp.ts` (`sse_legacy` vs `http`).

## `skills`

- `allowExternalScripts` — `"allow"` \| `"deny"` \| `"ask"`
- `allowAllowedToolsField` — `"allow"` \| `"deny"` \| `"ask"` for frontmatter tool lists

Aligns with `skillFrontmatterSchema` / manifest trust (`packages/core/src/schemas/skill.ts`).

## `privacy`

- `redactEnv` — list of environment variable names stripped from logs/export

Pairs with audit hashing fields in `AuditEntry` (`packages/core/src/types/trace.ts`).

## Merge semantics

Like agent config, YAML content merges over `defaultPolicyYaml()` inside `loadConfig` (`loader.ts`).
