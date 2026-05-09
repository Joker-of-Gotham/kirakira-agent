# Kirakira-Agent Config Layer

## Overview

The Config layer implements a four-tier configuration resolution system that merges settings from system, user, repository, and workspace levels.

## Architecture

```
Priority (low → high):

┌──────────────────┐
│ 1. System Layer  │  /etc/kirakira/agent.toml
├──────────────────┤
│ 2. User Layer    │  ~/.kirakira/config.toml
├──────────────────┤
│ 3. Repo Layer    │  ./agent.toml
├──────────────────┤
│ 4. Workspace     │  ./.kirakira/local.toml
└──────────────────┘

+ policy.yaml (governance, separate file)
```

## Packages

- **`@kirakira/config-resolver`** — loader, merger, policy-loader, resolved-state, model-config, watcher
- **`@kirakira/core`** — Zod schemas (`agentTomlSchema`, `policyYamlSchema`), types, constants

## Sub-docs

| Doc | Description |
|-----|-------------|
| [01-layer-precedence](./01-layer-precedence/) | Four-tier load order |
| [02-agent-toml-spec](./02-agent-toml-spec/) | agent.toml field reference |
| [03-policy-yaml-spec](./03-policy-yaml-spec/) | policy.yaml field reference |
| [04-merge-semantics](./04-merge-semantics/) | Deep merge rules |
| [05-resolved-state](./05-resolved-state/) | Final state & fingerprinting |
