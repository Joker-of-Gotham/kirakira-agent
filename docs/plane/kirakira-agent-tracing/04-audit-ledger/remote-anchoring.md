# Remote anchoring

Optional pipeline publishing **checkpoint digests or signed envelopes** off-host for immutable third-party corroboration and enterprise SIEM long-term archiving.

Depends on: [`checkpoint-spec.md`](./checkpoint-spec.md), [`signing-spec.md`](./signing-spec.md).

---

## Objectives

| Objective | Technique |
| --------- | --------- |
| Third-party timeline integrity | Rekor transparency upload |
| Durable immutable object store | Versioned S3 buckets with MFA delete governance |
| SIEM ingestion | Forward structured ECS events post-redaction |

---

## Sigstore Rekor flow

Upon finalized signed checkpoint (`aggregate_root_sig`):

1. Canonicalize minimal transparency entry `{root,producer,checkpoint_id}`
2. `rekor-cli upload --artifact=<blob> --public-key=@pub.pem`
3. Persist returned UUID + log index in companion metadata sidecar (`*.rekor.meta.json`)

Air-gapped estates mirror Rekor internally.

---

## Object storage archival

Recommended layout:

```
s3://corp-kirakira-audit/year=YYYY/month=MM/day=DD/
   segment-uuid.gz               # gzipped immutable append file
   checkpoint-<id>.json.sig      # detached signature artifact
```

Object lock **COMPLIANCE** mode 400-day minimum.

Lifecycle transitions:

| Age | Tier |
| --- | ----- |
| 0–30d STANDARD | frequent verification |
| 30–365d INFRE_ACCESS | thaw on demand |
| >365y GLACIER_IR | juridicial holds |

Customize per regulator.

---

## Enterprise SIEM replication

Hybrid pattern:

```
Local ledger -> forwarder daemon -> HTTPS HEC/collector ECS JSON
Collector -> indexer -> detection engine
Never forward raw MCP bodies—only digests mapped per ecs-mapping.md
```

Auth: mutually authenticated TLS leveraging org PKI.

---

## Failure semantics

Anchoring outages MUST NOT gate local enforcement—enqueue retry with exponential backoff + DLQ alerting if backlog > threshold aligning policy [`../../kirakira-agent-policy/10-fail-closed/README.md`](../../kirakira-agent-policy/10-fail-closed/README.md) Tier policy selection.

---

## Cross-links

SIEM ECS mapping specifics: [`../05-siem-integration/ecs-mapping.md`](../05-siem-integration/ecs-mapping.md)
