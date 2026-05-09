# ECS field mapping — Kirakira to Elastic Common Schema

Mapping primary internal event shapes to ECS **1.x** canonical fields simplifying cross-vendor dashboards.

Upstream integration context: [`README.md`](./README.md).

---

## Core mapping table

| Kirakira logical field | ECS field | Notes |
| ---------------- | --------- | ----- |
| `timestamp` | `@timestamp` | Normalize UTC |
| `event.category` literal `iam`/`process` contextual | derived | PDP deny → `intrusion_detection` optionally |
| `event.type` | `event.type` (`start`,`end`,`deny`,`info`) | Extend allowed values via vendor custom |
| `event.action` | `event.action` | e.g., `policy.evaluate`, `approval.grant` |
| `policy.effect` | `kirakira.policy.effect` (**custom**) + mirror `rule.description` heuristic | Maintain vendor extension namespace |
| `policy.reason_codes[0]` | `rule.name` surrogate | Concatenate stable code |
| `trace_id` hex | `trace.id` | 32-char lowercase |
| `span_id` | `span.id` | 16-char |
| `user.id` SSO | `user.id` | Pseudonymization optional |
| `host.hostname` collector | `host.name` | From resource attrs |
| `workspace_id` | `kirakira.workspace.id` (**custom**) | Document index template |
| `decision_id` | `kirakira.policy.decision_id` | Facet pivot |
| `approval_id` | `kirakira.approval.id` | Optional |
| `bundle_revision` | `kirakira.policy.bundle_revision` | Change analytics |
| Sandbox profile | `kirakira.sandbox.profile` | |
| `network.destination.domain` egress | Mapped from PEP network span | Omit if suppressed |

Maintain JSON index template versioning `ecs_kirakira_integration-YYYYMMDD`.

---

## Normalization snippets

Recommended ingest pipeline scripted translation (pseudo):

```text
if kirakira.policy.effect == "allow"  → ecs.event.outcome = "success"
if kirakira.policy.effect == "deny"   → ecs.event.outcome = "failure"
if kirakira.policy.effect == "escalate" → ecs.event.outcome = "unknown"  # or "failure" — standardize with SOC
```

Map `allow`→`success` subset cases carefully to avoid contradictory semantics.

---

## Hash field practices

Expose:

| Field | Source |
| ----- | ------- |
| `kirakira.hash.blake3` | Chain link |
| `kirakira.hash.checkpoint_root` | periodic |

Never double-hash pre-hashed payloads.

---

## Sample document (truncated JSON)

```json
{
  "@timestamp": "2026-05-05T06:41:09.221Z",
  "event.action": "policy.evaluate",
  "event.category": ["configuration"],
  "event.outcome": "failure",
  "trace.id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "user.id": "u_892",
  "kirakira.policy.reason_codes": "shell.pipe_to_shell;bundle.strict",
  "kirakira.policy.bundle_revision": "corp@8f92c81"
}
```

---

## Cross-links

Detection engineering referencing fields: [`detection-rules.md`](./detection-rules.md)
