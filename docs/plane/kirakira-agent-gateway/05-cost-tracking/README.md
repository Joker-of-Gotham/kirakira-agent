# Cost Tracking

## Per-Request Estimation

Each completion records:
- Input/output token counts (estimated from character count ÷ 4)
- Cost in USD based on model-specific pricing

## Built-in Price Table

| Model | Input $/M | Output $/M |
|-------|-----------|------------|
| gpt-4o | 2.50 | 10.00 |
| gpt-4o-mini | 0.15 | 0.60 |
| gpt-4.1 | 2.00 | 8.00 |
| claude-sonnet-4 | 3.00 | 15.00 |
| claude-opus-4 | 15.00 | 75.00 |

Self-hosted / local models default to $0.

## Budget Control

```toml
[model]
max_cost_per_session_usd = 5.0
```

When `CostTracker.is_over_budget()` returns true, the gateway returns an error instead of making the API call.

## JSON-RPC Method

`cost_summary` returns:
```json
{
  "total_cost_usd": 0.0235,
  "total_input_tokens": 5000,
  "total_output_tokens": 2000,
  "request_count": 3,
  "budget_usd": 5.0,
  "over_budget": false
}
```
