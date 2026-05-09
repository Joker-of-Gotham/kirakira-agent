# Data retention tiers

Defines lifecycle for traces, ledger segments, PDP decision logs mirrored into SIEM, satisfying engineering velocity vs regulatory obligations (**GDPR/CCPA**/sector-specific variants customer-defined).

Upstream: [`README.md`](./README.md).

---

## Tier taxonomy

| Tier | Scope | Typical hot retention | Cold / archive | Encryption |
| ---- | ----- | -------------------- | ------------- | --------- |
| T0 Ephemeral developer | Local `--dev` OTLP discard | Session duration | none | relaxed |
| T1 Standard multitenant SaaS aggregator | Hosted Tempo traces | 14–30 days | Glacier after 180d KMS | ✅ |
| T2 Enterprise regulated | Dedicated cluster + replicated ledger anchored | ≥90 days searchable hot | ≥7 years object lock | ✅ HSM KMS |
| T3 Incident legal hold subset | Tagged `legal_hold.case_id` | until manual release | indefinite isolated bucket | ✅ stricter ACL |

Operational selection per contract schedule.

---

## Field-level minimization triggers

Automatically drop high-cardinality / sensitive dims after downgrade:

```
After T1 hot expiry strip: attributes matching regex ^gen_ai.prompt
Retain only digests buckets
```

Ledger retains policy metadata longer than payload-bearing traces deliberately.

---

## Deletion SLA

Erase-on-request honoring privacy tickets:

| Data class | SLA guidance |
| ---------- | ----------- |
| PII keyed by user id pseudonym reversal table | purge mapping + tombstone sentinel row |
| Entire workspace enterprise offboarding | Batch ledger rewrite forbidden (breaks integrity); append signed archival or negation attestations per legal process |

Tamper-evidence vs forget-me tension resolved organizationally via policy addendum annex.

---

## Monitoring retention health

Dashboard panels:

```
days_to_expire_histogram
cold_restore_latency_p95
```

Alert if nearing compliance breach windows < 14d buffer.

---

## Cross-links

Remote anchoring long-term tiers [`../04-audit-ledger/remote-anchoring.md`](../04-audit-ledger/remote-anchoring.md)
