# Resolved State

## Structure

```typescript
interface ResolvedConfig {
  agentToml: Required<AgentToml>;    // Merged config
  policyYaml: Required<PolicyYaml>;  // Merged policy
  localConfig?: LocalConfig;         // Local overrides
  layers: ConfigLayer[];             // Source tracking
  configPaths: {                     // File locations
    agentToml?: string;
    policyYaml?: string;
    localConfig?: string;
    runtimeProfiles?: string;
  };
  runtimeState?: ResolvedRuntimeState; // Projected runtime profile state
  fingerprint: string;               // sha256, first 16 chars
  resolvedAt: string;                // ISO 8601 timestamp
}
```

## Fingerprint

A 16-character hex string derived from the merged `agentToml`, merged
`policyYaml`, and projected `runtimeState`. Used for cache invalidation: if the
fingerprint changes, any cached state derived from config is stale.

## Runtime State

`runtimeState` projects `configs/runtime/profiles.json` into the resolved config
without making `agent.toml` duplicate the runtime source of truth. It includes:

- `default_profile`
- expanded runtime profiles
- service catalog group names and compose-service aliases
- MCP catalog server names and rendered command descriptors per profile
- profile roots for workspace/app/MCP
- workbench presentation endpoints and browser gateway endpoint

The launcher scripts still use `scripts/runtime-profile.mjs` as the behavioral
runtime oracle. The config resolver projection exists so CLI, web, desktop,
audit, and future SDK/API consumers can inspect the same runtime shape instead
of maintaining their own static copy.

Use the profile-driven local targets: web workbench
`http://127.0.0.1:5183`, desktop renderer `http://127.0.0.1:5174`, and runtime
gateway `ws://127.0.0.1:17373/runtime`. A listener on `127.0.0.1:5173` is
Vite's generic default and is not a Kirakira validation target.

## Hot Reload

`ConfigWatcher` monitors config files with `fs.watch` (debounced at 500ms).
It emits `ConfigChangeEvent` when `agent.toml`, `policy.yaml`, or
`.kirakira/local.toml` changes. Consumers that need live runtime profile changes
should also watch `configs/runtime/profiles.json`.
