# SIEM detection rules — curated set (summary)

Operational detections aligning with ECS fields ([`ecs-mapping.md`](./ecs-mapping.md)).

Severity scale: **`low`**, **`medium`**, **`high`**, **`critical`**.

---

## Rule index

| ID | Objective | Severity | Primary signals |
| -- | --------- | -------- | ------------- |
| D-01 | Mass PDP denials anomaly | medium | Spike `kirakira.policy.effect=deny` per user |
| D-02 | Repeated sandbox activation failures | high | Fail ratio > threshold workstation |
| D-03 | Unsigned / invalid bundle reload attempt | critical | PDP verify failure codes |
| D-04 | Burst approval revocations post credential incident | medium | `approval.revoked` events clustering |
| D-05 | MCP destructive tool escalation trend | medium | PEP classification tags |
| D-06 | Unauthorized network egress attempt storm | high | Network PEP denies |
| D-07 | Policy bundle downgrade / rollback anomaly | medium | revision monotonicity break |
| D-08 | Ledger hash verification failure SOC | critical | audit verify tooling remote agent |
| D-09 | Sensitive workspace classification vs egress routing | medium | Classification contradicts egress `allow` telemetry |
| D-10 | Break-glass approval usage | high | flag token usage events |

Descriptions intentionally concise—author concrete SPL/KQL variants per deployment.

---

## Example logic fragments (pseudo)

### D-03 bundle integrity

```
count(event_code="bundle.signature.invalid") BY host > 0 in 5m => page SecEng
```

### D-06 egress storm

```
sum(network_pep.denied_total) PER user PER 15m > 50 => investigate possible data staging
```

### D-10 break glass

```
event.action=="approval.break_glass_invoke" ALWAYS page + create ticket templated RUNBOOK BG-42
```

---

## Tuning guidance

Maintain allow-list maintenance windows tagging `kirakira.maintenance.flag=true` to suppress benign noise.

Conduct quarterly ROC analysis adjusting thresholds.

---

## Cross-links

Retention alignment for alert evidence storage [`retention-policy.md`](./retention-policy.md)
