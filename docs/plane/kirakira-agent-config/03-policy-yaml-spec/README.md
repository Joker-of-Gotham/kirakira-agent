# policy.yaml Specification

## Purpose

Governance controls separated from developer preferences. YAML for human readability during security reviews.

## Sections

### `shell`
```yaml
shell:
  hostExecution: deny    # allow | deny | ask
  allowlist:
    - "git:*"
    - "npm:*"
  denylist:
    - "rm:*"
    - "sudo:*"
```

### `mcp`
```yaml
mcp:
  allowRemoteHttp: true
  allowLegacySse: ask
  approvedServers: [trusted-server]
  deniedServers: [malicious-server]
```

### `privacy`
```yaml
privacy:
  redactEnv:
    - OPENAI_API_KEY
    - AWS_SECRET_ACCESS_KEY
  disablePromptLogging: false
```

### `budget`
```yaml
budget:
  max_cost_per_session_usd: 5.0
  max_cost_per_day_usd: 50.0
  alert_threshold_pct: 80
```

### `network`
```yaml
network:
  allowed_domains: [api.openai.com, api.anthropic.com]
  denied_domains: [evil.com]
```
