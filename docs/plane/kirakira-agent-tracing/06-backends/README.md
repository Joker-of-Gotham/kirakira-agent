# Trace backend comparison & deployment guides

Selecting observability backends for **development ergonomics vs production scalability** referencing OpenTelemetry interoperability.

Correlation with architecture plane note [`../kirakira-agent-policy.md`](../kirakira-agent-policy.md).

---

## Feature matrix

| Backend | Typical role | OTLP ingestion | Strengths | Tradeoffs |
| ------- | ----------- | ------------- | --------- | --------- |
| **Jaeger** | Local dev quickstart | ✅ native receiver | Lightweight UI, collector v2 unification | Persistence scaling manual |
| **Grafana Tempo** | Prod trace store | ✅ via Grafana Agent / Collector | Object storage economics, Grafana correlation | Operational complexity upfront |
| **LangSmith** | LLM iterative eval | ✅ OTel ingestion path | Prompt iteration ergonomics SaaS/offline options | Licensing / data residency scrutiny |
| **Langfuse** | Self-host LLMOps | ✅ OTel-centric design | Transparency + dashboards | Maintain upgrade cadence |
| **Phoenix (Arize)** | Drift observability hybrid | ✅ OTLP ingestion | Embedding quality overlays | Narrower infra mindshare |

No backend replaces audit ledger cryptographic guarantees [`../04-audit-ledger`](../04-audit-ledger).

---

## Development deployment sketch (Jaeger)

```yaml
services:
  jaeger:
    image: jaegertracing/jaeger:2.y
    environment:
      - COLLECTOR_OTLP_ENABLED=true
    ports:
      - "4317:4317"   # OTLP gRPC convenience
```

CLI env:

```
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
```

---

## Production pattern (Collector + Tempo + Grafana)

Pipeline:

```
Agents -> Grafana Alloy OR OTel Collector
         -> exporters tempo
Collector processors: tail_sampling, attributes/redact ...
Grafana dashboards folder kirakira-overview
Backend object storage MinIO|S3 configurable
```

Key sizing levers:

| Parameter | Guidance |
| --------- | --------- |
| Ingest QPS spikes | Burst allow via Kafka buffer optional |
| Retention window | Tie to SIEM tiers [`../05-siem-integration/retention-policy.md`](../05-siem-integration/retention-policy.md) |

Validate head sampling vs tail sampling interplay with PDP security requirement (document in sampling doc updates future).

---

## LangSmith considerations

Organizations enabling LangSmith SHOULD:

Map `trace.id` aligning internal correlation.

Review data processing agreement for multi-tenant segregation.

Hybrid export (LangSmith AND Tempo) permitted via Collector fan-out exporters.

---

## Langfuse self-host Helm highlights

Stateful PostgreSQL dependency + optional ClickHouse offload—consult official chart versioning policy—pin major chart semvers.

Ensure redaction processors precede ingestion.

---

## Phoenix quickstart snippet

Minimal docker compose addition exposing OTLP 6006 ingestion path per Phoenix releases—consult upstream docs pinned version.

Primary value: embeddings drift histogram overlays complement policy denies analytics.

---

## Migration guidance dev→prod

1. Freeze resource attribute schema versioning.
2. Introduce Collector redaction before exposing wider audience data.
3. Enable Tempo compaction schedule aligned with infra cost reviews quarterly.

---

## Cross-links

OTel foundational setup [`../01-otel-architecture/README.md`](../01-otel-architecture/README.md)
