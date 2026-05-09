# Kirakira custom attributes (`kirakira.*`)

Complete namespace for instrumentation beyond GenAI semantics. Types follow OpenTelemetry conventions (`string`,`int`,`double`,`boolean`,`string[]`).

General hierarchy reference: [`README.md`](./README.md).

---

## Identity & tenancy

| Attribute | Type | Description |
| --------- | ---- | ----------- |
| `kirakira.org_id` | string | Organizational tenant slug |
| `kirakira.workspace_id` | string | Logical workspace grouping |
| `kirakira.session_id` | string | Stable agent CLI session |

---

## Policy engine

| Attribute | Type | Description |
| --------- | ---- | ----------- |
| `kirakira.policy.request_id` | string | Policy evaluation cycle correlator |
| `kirakira.policy.decision_id` | string | PDP output id mirrored in approvals |
| `kirakira.policy.bundle_id` | string | Active bundle symbolic id |
| `kirakira.policy.bundle_revision` | string | Git / digest slug |
| `kirakira.policy.effect` | string | `allow`, `deny`, `escalate` |
| `kirakira.policy.reason_codes` | string | Semicolon-separated machine codes |

---

## AIRISK

| Attribute | Type | Description |
| --------- | ---- | ----------- |
| `kirakira.airisk.classifications` | string | Comma-separated rule ids emitted |
| `kirakira.airisk.injection_pressure` | double | 0..1 heuristic |
| `kirakira.airisk.supply_chain_score` | double | 0..1 heuristic |

---

## PEP namespaces

Suffix channel name (`shell`,`mcp`,...):

| Pattern | Example | Description |
| ------- | ------- | ----------- |
| `kirakira.pep.<ch>.tool_name` | `kirakira.pep.shell.tool_name` | Logical tool moniker |
| `kirakira.pep.<ch>.normalized_digest` | `...normalized_digest` | BLAKE3 of normalized excerpt |
| `kirakira.pep.mcp.server_id` | string | MCP server identifier |
| `kirakira.pep.model.provider` | string | Gateway vendor |
| `kirakira.pep.model.model_id` | string | Model slug |

Additional `kirakira.pep.*` keys appear in PEP-specific plane docs [`../../kirakira-agent-policy/04-pep-layer/README.md`](../../kirakira-agent-policy/04-pep-layer/README.md).

---

## Approval & sandbox

| Attribute | Type | Description |
| --------- | ---- | ----------- |
| `kirakira.approval.id` | string | Approval record id |
| `kirakira.approval.scope` | string | PDP scope enumerator |
| `kirakira.approval.fingerprint_algo` | string | e.g. `blake3-rfc8785-v1` |
| `kirakira.sandbox.profile` | string | Catalog profile name |
| `kirakira.sandbox.backend` | string | Platform backend discriminator |

---

## Audit / ledger bridging

| Attribute | Type | Description |
| --------- | ---- | ----------- |
| `kirakira.audit.segment_id` | string | Append segment pointer |
| `kirakira.audit.chain_head` | string | Latest BLAKE3 root nibbles |

Ledger spec: [`../04-audit-ledger/README.md`](../04-audit-ledger/README.md).

---

## Sampling hints (non-standard advisory)

| Attribute | Type | Description |
| --------- | ---- | ----------- |
| `kirakira.trace.sampling.priority` | int | PDP obligation hint negative = downsample aggressively |

Consumption described in sampling doc.

---

## Error taxonomy

| `kirakira.error.kind` | Scenario |
| ---------------- | -------- |
| `pdp_unavailable` | Transport / crash |
| `pdp_denied` | Effect deny—not always error semantics (use event) |
| `sandbox_activate_failed` | seccomp/load issue |
| `audit_append_failed` | disk / permission |

Prefer events over error status for deterministic denies to avoid distorting RED metrics—configurable exporter transform.

---

## Extension process

Proposal template:

```
kirakira.<domain>.<facet>_<unit>
```

RFC via architecture guild + update this table centrally.
