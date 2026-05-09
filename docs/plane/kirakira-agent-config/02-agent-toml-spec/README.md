# agent.toml Specification

## Sections

### `[model]`
```toml
[model]
default = "gpt-4o"
fallback = "gpt-4o-mini"
max_cost_per_session_usd = 10.0

[[model.providers]]
name = "primary"
type = "openai"
base_url = "https://api.openai.com/v1"
api_key_env = "OPENAI_API_KEY"
default_model = "gpt-4o-2024-11-20"
timeout = 60
max_retries = 3
```

### `[registry]`
```toml
[registry]
default_source = "internal"
install_scope = "workspace"

[[registry.sources]]
name = "internal"
url = "https://registry.internal.dev"
type = "kirakira"
auth_token_env = "REGISTRY_TOKEN"
```

### `[features]`
```toml
[features]
tool_search = true
lazy_schema_injection = true
progressive_skill_loading = true
cost_tracking = false
```

### Other Sections

| Section | Key Fields |
|---------|-----------|
| `[ui]` | theme, vim_mode, show_trace_ids |
| `[output]` | default, exec_default |
| `[approvals]` | mode, auto_run_readonly |
| `[sandbox]` | mode, network |
| `[skills]` | discover (path array) |
| `[mcp]` | config_files, tool_search, lazy_schema |
| `[compat]` | read_claude, read_codex, read_cursor, etc. |
| `[telemetry]` | mode, otel |
