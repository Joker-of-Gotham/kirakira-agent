# Model Resolver

## Purpose

Fixes the V3 model name identification issues by providing:
1. Provider prefix stripping
2. Short alias resolution
3. Fuzzy matching against endpoint models
4. Config drift detection

## Pipeline

```
Input: "openai/gpt-4o"
  │
  ├─ strip_provider_prefix → "gpt-4o"
  │
  ├─ resolve_alias → "gpt-4o-2024-11-20"
  │
  └─ Output: "gpt-4o-2024-11-20"
```

## Built-in Aliases

| Short Name | Canonical ID |
|------------|--------------|
| `gpt-4o` | `gpt-4o-2024-11-20` |
| `gpt-4o-mini` | `gpt-4o-mini-2024-07-18` |
| `claude-sonnet` | `claude-sonnet-4-20250514` |
| `claude-opus` | `claude-opus-4-20250514` |
| `qwen3` | `Qwen/Qwen3-32B` |

## Config Drift Detection

`detect_config_drift()` compares the configured model name against the endpoint's `/v1/models` list and returns a human-readable warning if there's a mismatch.
