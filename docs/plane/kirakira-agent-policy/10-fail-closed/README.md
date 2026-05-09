# Fail-closed operation

The harness defaults to **`DENY`** when safety-critical subsystems degrade. This document catalogs **six primary degradation scenarios**, recommended **recovery playbooks**, and **monitoring** hooks.

Upstream architecture: [`../02-architecture/README.md`](../02-architecture/README.md).

---

## Degradation scenarios

| # | Scenario | Immediate user-visible symptom | Effective security posture |
|---|----------|--------------------------------|----------------------------|
| 1 | **PDP bundle unavailable / unloadable** (`opa` crash loop) | `kirakira policy eval` timeouts; CLI blocks risky tools | ✅ Hard deny destructive classes / static kill-switch PEP |
| 2 | **Signature verification failure** on bundle artifact | Reload aborted + error banner | ✅ Old bundle retained OR deny-all safe mode toggle |
| 3 | **`kirakirad` unreachable** | RPC transport errors exponential backoff | ✅ PEP queue stall → deny writes/network after grace window configurable |
| 4 | **Sandbox activation failure** (missing KVM / nsjail) | Doctor warnings + suppressed exec | ⚠ PDP obligation abort → denies action (preferred) vs legacy fallback escalate |
| 5 | **Audit ledger append-only write failure** (disk full / perms) | Background retry queue saturated | ⚠ Policy chooses `DENY_EXECUTE` vs `ALLOW_WITH_LOCAL_QUEUE` (**must align compliance stance**) |
| 6 | **Approval subsystem outage** while `approval.required=true` | Pending indefinite | ✅ Deny escalation after SLA unless emergency break-glass key rotation recorded |

Configurable compliance tier toggles dictate rows **5 & 6** strictness variant.

---

## Recovery procedures (operators)

### 1–2 PDP / bundle faults

```
kirakira policy verify-bundle --path bundles/corp.tgz
kirakira policy status --why
journalctl -u kirakirad -n 500
```

If corrupt: rollback artifact pointer to last known-good manifest hash (record change in ticketing).

### 3 Transport failure

Restart `kirakirad`, validate Unix socket ACLs, regenerate mTLS certs if applicable.

Playbook SLA: escalate if outages > **`N`** minutes (**set per tenant**).

### 4 Sandbox fault

Follow [`../08-sandbox/platform-backends.md`](../08-sandbox/platform-backends.md) doctor remediation; downgrade profile only via signed temporary waiver manifest.

### 5 Ledger failure

1. Assess disk freespace `/var/kirakira-audit`.
2. If transient: drain retry queue metrics `kirakira_audit_queue_depth`.
3. If prolonged: failover to syslog shipper until restore.

### 6 Approval outage

Enable **break-glass** procedure (dual-control key) ⇒ emits high severity SIEM alerts with mandatory post-incident review.

---

## Monitoring recommendations

| Signal | Severity | Interpretation |
| ------ | --------- | ----------- |
| `kirakira_pdp_reload_fail_total` | P1 spike | Possibly malicious bundle attempt |
| `kirakira_rpc_latency_seconds_p99` | P2 degrade | PEP backlog risk implicit |
| `kirakira_sandbox_activation_fail_ratio` | P2 drift | Potential kernel policy drift |

Dash graph correlation with **`trace_id`** sample tails.

Synthetic probe: hourly `kirakira policy eval --replay-test-vector`.

---

## User messaging guidelines

Failures MUST propagate stable `reason_codes` (avoid leaking internal stack traces)—reference [`../03-data-model/policy-decision.md`](../03-data-model/policy-decision.md) rationale mapping.

---

## Cross-links

- CLI diagnostics: [`../11-cli-commands/README.md`](../11-cli-commands/README.md)
