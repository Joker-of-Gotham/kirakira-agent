# Resolved State

## Structure

```typescript
interface ResolvedConfig {
  agentToml: Required<AgentToml>;    // Merged config
  policyYaml: Required<PolicyYaml>;  // Merged policy
  localConfig?: LocalConfig;          // Local overrides
  layers: ConfigLayer[];              // Source tracking
  configPaths: {                      // File locations
    agentToml?: string;
    policyYaml?: string;
    localConfig?: string;
  };
  fingerprint: string;                // sha256 (first 16 chars)
  resolvedAt: string;                 // ISO 8601 timestamp
}
```

## Fingerprint

A 16-character hex string derived from `sha256(JSON.stringify({ agentToml, policyYaml }))`. Used for cache invalidation — if the fingerprint changes, any cached state derived from config is stale.

## Hot Reload

`ConfigWatcher` monitors config files with `fs.watch` (debounced at 500ms). Emits `ConfigChangeEvent` when `agent.toml`, `policy.yaml`, or `.kirakira/local.toml` change.
