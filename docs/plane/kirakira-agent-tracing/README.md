# Kirakira Agent Tracing & Audit

Observability and **tamper-evident audit** unify policy outcomes with runtime evidence: spans across PEPs/AIRISK/PDP/sandbox approvals, OTLP exporters, immutable **audit ledgers**, and SIEM-friendly exports (`ECS`). This documentation complements [`../kirakira-agent-policy`](../kirakira-agent-policy) — policy without durable trace corroboration is weaker for SOC investigations.

## Pillars

| Pillar | Description |
| ------ | ----------- |
| **OTel-first** | All subsystems integrate OpenTelemetry Tracing API exporters |
| **Audit ledger** | Append-only BLAKE3-chained segments with periodic checkpoints [`./04-audit-ledger`](./04-audit-ledger) |
| **Policy-aware sampling/redaction** | PDP obligations + tracing config unify privacy/compliance knobs [`./03-sampling-redaction`](./03-sampling-redaction) |
| **Operational backends** | Dev (Jaeger) vs Prod (Tempo stack) selections [`./06-backends`](./06-backends) |

```mermaid
flowchart LR
  CLI[Kirakira CLI + kirakirad] --> OTEL[OTel SDK]
  OTEL --> EXP[Exporter]
  EXP --> TMP[Jaeger | Tempo | Langfuse | Phoenix | Vendor]
  CLI --> AUD[Audit ledger]
  AUD --> ECS[ECS JSON / SIEM]
```

## Documentation map

| Section | Topics |
| ------- | ------- |
| [`./01-otel-architecture`](./01-otel-architecture) | TracerProvider, processors, exporters, resources |
| [`./02-span-taxonomy`](./02-span-taxonomy) | Span hierarchy & attributes |
| [`./03-sampling-redaction`](./03-sampling-redaction) | Policy-driven sampling rates, collector configs |
| [`./04-audit-ledger`](./04-audit-ledger) | Hash chain & signing |
| [`./05-siem-integration`](./05-siem-integration) | ECS mapping & detections |
| [`./06-backends`](./06-backends) | Backend comparison |
| [`./07-cli-commands`](./07-cli-commands) | `kirakira audit`, `kirakira siem` |

## Plane-level overview

Historical consolidated narrative remains in [`../kirakira-agent-policy.md`](../kirakira-agent-policy.md).

## Relationship to Policy Engine

| Policy artifact | Trace tie-in |
| --------------- | ------------ |
| `PolicyInput.request_id` | Span linkage + baggage |
| PDP `decision_id` | `kirakira.policy.decision` span attributes & ledger rows |

See [`../kirakira-agent-policy/03-data-model`](../kirakira-agent-policy/03-data-model).
