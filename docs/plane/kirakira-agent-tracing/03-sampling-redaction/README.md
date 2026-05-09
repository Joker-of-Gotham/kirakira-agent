# Sampling & redaction

Balancing investigative utility vs leakage risk spans **policy-directed sampling tiers** complemented by OTel Collector **redaction processors** plus explicit **content capture opt-in**.

Cross references:

- PDP obligations: [`../../kirakira-agent-policy/09-obligation/README.md`](../../kirakira-agent-policy/09-obligation/README.md)
- Attr namespace: [`../02-span-taxonomy/kirakira-custom-attributes.md`](../02-span-taxonomy/kirakira-custom-attributes.md)

---

## Policy-driven sampling matrix

Interpretation merges **`kirakira.trace.sampling.priority`** PDP hints into root sampler adapters.

| Policy tier | Sampling rate guideline | Applies to |
| ----------- | ------------------------ | --------- |
| `security_review` | 100% of deny/escalate + obligations failures | Highest evidence |
| `standard_interactive_dev` | 25% benign allow paths | Velocity |
| `batch_ci` | 5% successes, 50% denies | Noise control |
| `restricted_data_workspace` | 10% capped + payloads never captured | Sensitive org |

Exact numeric values configured enterprise-wide via Helm values / config doc.

Implementation sketch:

```
if span.attributes["kirakira.policy.effect"] IN ["deny","escalate"]:
    always_record()
elif priority_attribute < -5:
    parent_based(rate=0.05)
...
```

---

## OTel Collector redaction configuration

Processor chain example (**illustrative YAML**):

```yaml
processors:
  attributes/remove_sensitive:
    actions:
      - key: gen_ai.prompt
        action: delete
      - key: mcp.argument.payload
        action: delete
  transform/hash_tool_args:
    error_mode: ignore
    trace_statements:
      - context: span
        statements:
          - set(attributes["kirakira.pep.shell.argv_digest"], SHA256(attributes["kirakira.pep.shell.argv"]))
```

Order:

```
receivers -> memory_limiter -> redact -> batch -> exporters
```

---

## Content capture opt-in mechanism

Controlled via layered consent:

```
KIRAKIRA_TRACE_CAPTURE_PAYLOADS=restricted|never|always_dev_only
```

| Mode | Behavior |
| ---- | -------- |
| `never` (default prod) | Strip large string attributes centrally |
| `restricted` | Allow hashed digests only |
| `always_dev_only` | Permits bounded preview strings ≤ 4KiB sanitized |

SOC investigations requiring ephemeral expansion sign **timed capability token** audited to ledger [`../04-audit-ledger/signing-spec.md`](../04-audit-ledger/signing-spec.md).

---

## Model output handling

Truncate assistant completions unless explicit compliance approval—GenAI instrumentation maps to hashing strategy in [`../02-span-taxonomy/genai-semconv.md`](../02-span-taxonomy/genai-semconv.md).

---

## Validation

Quarterly audits sample exported spans verifying absence of plaintext secrets regex classes (`PRIVATE KEY`,`Authorization:`).

Synthetic leak tests in CI injecting dummy patterns must fail exporter pipeline.

---

## Cross-links

SIEM ingestion after redaction: [`../05-siem-integration/ecs-mapping.md`](../05-siem-integration/ecs-mapping.md)
