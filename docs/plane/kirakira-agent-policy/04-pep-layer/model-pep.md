# Model PEP

Govern **`model.invoke`** actions routed through gateways (hosted LLM APIs and local GGUF backends). Implements **provider and model allowlists**, cost observability hooks, optional **VPC-only routing** mandates, and safe handling of **`data_classification`** labels.

Upstream context: [`README.md`](./README.md).

---

## Invocation normalization

Recommended `action.normalized` fields:

| Field | Description |
| ----- | ----------- |
| `provider` | Logical gateway id (`openai`, `anthropic`, `google`, `cursor`, …) |
| `model_id` | Fully-qualified model slug |
| `invocation_kind` | `chat`, `tool_loop`, `batch`, `embedding` |

Bridge GenAI semantic conventions for tracing exporters ([`../../kirakira-agent-tracing/02-span-taxonomy/genai-semconv.md`](../../kirakira-agent-tracing/02-span-taxonomy/genai-semconv.md)).

---

## Provider allowlist evaluation

Bundles reference `data.kirakira.models` documents enumerating permissible `(provider, model_id)` pairs. Enforcement pattern:

```
deny unless (provider ∈ allowlist ∧ model_id wildcard match succeeds)
```

Conflicting static configuration merges follow plane docs for `kirakira-agent-config` precedence when present.

---

## Cost cap integration

Model PEP attaches **estimated token usage** hints (`risk.estimated_tokens`, `risk.estimated_cost_usd_micros`). PDP MAY:

| Signal | Obligation suggestion |
| ------ | -------------------- |
| Projected monthly burn threshold | `notify` escalation |
| Hard cap breached | deterministic `deny` with `reason_codes: ["cost.cap.exceeded"]` |

---

## Data classification linkage

Honor `workspace.labels.data_classification`:

| Label | Typical bundle posture |
| ----- | ------------------------ |
| `public` | Default cloud routing allowed |
| `internal` | Require corporate-hosted gateway endpoints |
| `restricted` | Deny hosted inference unless PDP lists explicit HIPAA/SOC-compliant endpoints |

Plaintext credential heuristics in prompts MUST short-circuit to **`deny`** before egress.

---

## Degraded gateway behavior

Outages tie to [`../10-fail-closed/README.md`](../10-fail-closed/README.md):

| Mode | Behavior |
| ---- | --------- |
| Cloud unreachable | Default deny interactive side-effecting workflows |
| Local-only escape hatch | PDP may allow quantized local models registered in allowlist |

---

## Cross-links

- OTel SDK integration overview: [`../../kirakira-agent-tracing/01-otel-architecture/README.md`](../../kirakira-agent-tracing/01-otel-architecture/README.md)
