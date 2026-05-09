# Configuration precedence

`loadConfig` (`packages/cli/src/config/loader.ts`) builds a **`ResolvedConfig`** by:

1. Starting from **`defaultAgentToml()`** and **`defaultPolicyYaml()`** (`defaults.ts`).
2. If `resolveConfigPaths` finds files, parsing and **deep-merging** them over defaults.

## File discovery order (`paths.ts`)

`resolveConfigPaths(workspaceRoot, configOverride?)` returns:

| Key | Resolution |
|-----|------------|
| `agentToml` | `configOverride` **or** first existing `workspaceRoot/agent.toml` (`PATHS.workspaceConfig`) |
| `policyYaml` | `workspaceRoot/policy.yaml` |
| `localConfig` | `workspaceRoot/.kirakira/local.toml` (private) |
| `userConfig` | `~/.kirakira/config.toml` (candidate path; merge wiring may extend) |
| `userHome` | `~/.kirakira` root |

Constants: `packages/core/src/constants.ts`.

## Layered model (conceptual)

When documenting enterprise rollout, think in terms of:

1. **System** — `/etc` skills only (`PATHS.systemSkills`)—not merged into agent.toml but affects discovery.
2. **User** — `~/.kirakira/config.toml`, `~/.kirakira/skills/`.
3. **Workspace** — `agent.toml`, `policy.yaml`, `.kirakira/skills/`.
4. **Private** — `.kirakira/local.toml` (machine-specific; should stay out of VCS).
5. **Environment** — variables expanded by `envExpand` during parse.
6. **CLI flags** — e.g. `kirakira-agent exec -c /path/agent.toml` overrides workspace file path for **agent** parse only.

> **Note:** `loader.ts` currently merges explicit files with defaults; always check the implementation when adding new layers (user merge for `localConfig` may require extending `deepMerge` paths).

## Policy vs agent

`policy.yaml` encodes **enforceable** org rules; `agent.toml` encodes **agent UX defaults**. Conflicts should be resolved in favor of **policy** for security decisions (shell host execution, MCP SSE, external scripts).
