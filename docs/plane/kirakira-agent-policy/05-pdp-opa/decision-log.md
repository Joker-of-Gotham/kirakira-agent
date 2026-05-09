# Decision log format & masking

The PDP emits **streaming decision artifacts** correlating PEP submissions with policy outcomes—used for dashboards, deterministic replay (`kirakira policy replay`), and tamper-evident ledger anchoring pairs.

Upstream: [`README.md`](./README.md).

---

## Record envelope

Each line SHOULD be newline-delimited JSON (NDJSON) or protobuf-to-json bridging:

```
{
  "ts": "2026-05-05T04:56:02.884Z",
  "bundle_revision": "8f92c81",
  "decision_id": "dec_abcd1234",
  "request_id": "req_xyz",
  "trace_id": "...",
  "effect": "allow",
  "reason_codes": ["shell.network_fetch"],
  "input_digest": "blake3:...masked...",
  "matched_rules": [
    "data.kirakira.shell.warn_network_bundle"
  ],
  "explain_summary": "...redacted textual summary..."
}
```

| Field | Redaction stance |
| ----- | ---------------- |
| **`input_digest`** | Hashed canonical subset of PDP input (RFC 8785 + BLAKE3) |
| **`explain_summary`** | Natural language safe—strip path segments beyond workspace root optionally |
| **Raw prompts / MCP bodies** | NEVER appear |

---

## Masking tiers

| Tier | Applies when | Technique |
| ---- | ----------- | --------- |
| **Tier A Metadata-only** | Default enterprise logging | Omit `explain_summary`, keep hashed digests |
| **Tier B Operator assist** | Incident response window | Expand limited path tokens under RBAC |

Escalations require ephemeral signing token from security role.

---

## Transport

Recommended flows:

```
PDP Wasm → shim writer → FIFO → audit ledger appender → gzip rotation
```

Alternatively export via OTLP **logs** bridging with ECS mapping downstream ([`../../kirakira-agent-tracing/05-siem-integration/ecs-mapping.md`](../../kirakira-agent-tracing/05-siem-integration/ecs-mapping.md)).

---

## Integrity

Each NDJSON segment optionally signed with keyed blake keyed MAC then checkpointed collectively on ledger rotations ([`../../kirakira-agent-tracing/04-audit-ledger/hash-chain-spec.md`](../../kirakira-agent-tracing/04-audit-ledger/hash-chain-spec.md)).

---

## Query patterns

|SPL / SQL-ish example (illustrative)|Outcome|
|---|---|
|`effect="deny" AND bundle_revision != expected`|Drift/supply chain anomaly|
|`reason_codes CONTAINS "policy.signature.invalid"`|**Critical** PDP failure spikes|

---

## Retention tiers

Aligned with tracing retention buckets ([`../../kirakira-agent-tracing/05-siem-integration/retention-policy.md`](../../kirakira-agent-tracing/05-siem-integration/retention-policy.md)):

| Tier | Retention guideline |
| ---- | -------------------- |
| Hot | ≤ 90 days searchable |
| Cold object storage | 7y compliance (jurisdiction-dependent) |

---

## Cross-links

- Bundle authenticity: [`bundle-signing.md`](./bundle-signing.md)
- CLI verification: [`../11-cli-commands/README.md`](../11-cli-commands/README.md)
