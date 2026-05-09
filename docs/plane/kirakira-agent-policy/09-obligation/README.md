# Obligation executor

Consumes authoritative [`PolicyDecision`](../03-data-model/policy-decision.md) payloads, instantiating **nine obligation types**. Executes in deterministic order enforcing **abort-on-failure** semantics for required obligations.

---

## Obligation taxonomy

| Order rank | Type | Purpose | Required default |
| ---------- | ---- | ------- | ---------------- |
| 10 | **`sandbox`** | Transition into named profile | ✅ when present |
| 20 | **`network_allowlist`** | Augments ephemeral egress allowlist | ⚠ PDP flags |
| 30 | **`secret_projection`** | Mount/proxy secrets minimally | PDP toggled |
| 40 | **`approval`** | Acquire human/auto approval fingerprint | PDP toggled |
| 50 | **`reason_required`** | Force explanatory text / ticket id | PDP toggled |
| 60 | **`trace_redaction`** | Apply span attribute redactors | ⚠ telemetry-only failures downgrade per policy |
| 70 | **`audit_append`** | Write structured audit ledger row segment | ✅ |
| 80 | **`copyout_review`** | Artifact scanning before host exposure | PDP toggled |
| 90 | **`notify`** | Push Slack/email/webhooks on completion | ⚠ optional / best-effort |

Exact numeric ranks configurable per enterprise policy pack—document overrides in manifests.

Execution MUST be sequential monotonic ascending unless PDP attaches explicit `ordering_group` annotations (advanced—future schema).

---

## Required vs optional

| Category | Abort semantics |
| -------- | ------------- |
| **Required** (`required: true` default critical types) | ANY failure ⇒ entire obligation stage abort ⇒ PEP denies execution |
| **Optional** (`required: false`) | Failures logged; continuation allowed only if PDP `effect` semantics permit partial optional failure (explicit future extension—currently disallow partial success ambiguity: treat unspecified as required except `notify`, `trace_redaction` softened). |

Recommended baseline:

| Obligation | `required` default |
| --------- | ----------------- |
| `sandbox` | `true` |
| `approval` | mirrors PDP `approval.required` |
| `audit_append` | `true` unless debugging flag `KIRAKIRA_AUDIT_BESTEFFORT` (non-prod only) |

---

## Detailed semantics summaries

### `sandbox`

Activates platform backend [`../08-sandbox/README.md`](../08-sandbox/README.md).

### `network_allowlist`

Merges additional domains/socket endpoints for **only** evaluated action—not persistent profile mutation unless `scope` extends.

### `secret_projection`

Interacts with Vault / cloud KMS gateways; ephemeral mount lifetime == action.

### `approval`

Delegates to Approval Manager lifecycle [`../07-approval/README.md`](../07-approval/README.md).

### `reason_required`

Blocks until operator supplies non-empty rationale string meeting `min_length` if provided—feeds ticketing automation.

### `trace_redaction`

Transforms OTel exporters / span processors — cannot weaken security approvals retroactively—failures escalate only if PDP marks required.

### `audit_append`

Appends BLAKE3-chained ledger entry [`../../kirakira-agent-tracing/04-audit-ledger/README.md`](../../kirakira-agent-tracing/04-audit-ledger/README.md).

### `copyout_review`

Triggers AV / DLP scan pipeline before releasing artifacts (`../08-sandbox/profile-catalog.md`).

### `notify`

Webhook dispatch after success—not on deny unless bundle indicates incident path.

---

## Abort semantics consolidated

```
for obligation in sorted_obligations:
    result = executor.run(obligation)
    if not result.ok and obligation.required:
           rollback prior compensating reversible obligations (sandbox spawn etc.)
           return ABORT_DENIED to PEP with aggregated reason_codes
```

Rollback matrix:

| Obligation reversed on abort | Technique |
| ---------------------------- | --------- |
| `sandbox` child started | Kill process group SIGKILL |
| `secret_projection` mount | Lazy unmount namespaces |

Approval partial states SHOULD NOT linger—write compensating **`revoked`** audit events.

---

## Interaction with effect types

Even `effect: allow`, missing mandatory obligations ⇒ **treated as deny** at PEP boundary consistency layer.

---

## Testing matrix

Synthetic vectors ensuring permutations covering:

```
[sandbox→approval→audit_append]
[approval denies mid chain → sandbox teardown verified]
```

---

## Related

| Topic | Doc |
| ----- | ----- |
| CLI introspection (`kirakira policy replay`) | [`../11-cli-commands/README.md`](../11-cli-commands/README.md) |
