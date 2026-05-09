# JSON-RPC Protocol

## Transport

JSON-RPC 2.0 over stdio. The TS CLI spawns the Python gateway as a child process and communicates via stdin/stdout line-delimited JSON.

## Methods

| Method | Params | Response |
|--------|--------|----------|
| `complete` | `{prompt, model?, system_prompt?, temperature?, max_tokens?}` | `{text, model, raw_error?}` |
| `health` | `{}` | `{ok, model?, latencyMs?, error?}` |
| `list_models` | `{}` | `[{id, owned_by?}]` |
| `resolve_model` | `{model}` | `{original, resolved, capability?}` |
| `list_capabilities` | `{}` | `{model_id: {capability_fields...}}` |
| `cost_summary` | `{}` | `{total_cost_usd, request_count, ...}` |
| `switch_provider` | `{provider, base_url?}` | `{previous_provider, current_provider}` |

## Request Format

```json
{"jsonrpc":"2.0","id":1,"method":"complete","params":{"prompt":"Hello","temperature":0.2,"max_tokens":4096}}
```

## Response Format

```json
{"jsonrpc":"2.0","result":{"text":"Hi there!","model":"gpt-4o-2024-11-20"},"id":1}
```

## Error Codes

| Code | Meaning |
|------|---------|
| -32700 | Parse error |
| -32600 | Invalid request |
| -32601 | Method not found |
| -32602 | Invalid params |
| -32603 | Internal error |
