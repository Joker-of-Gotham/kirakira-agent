# PolicyDecision (`kirakira.decision.v1`)

Authoritative PDP output produced after Rego evaluates structural inputs derived from **`PolicyInput`**, AIRISK classification, ambient policy data bundles, and (optionally) prior approval stickiness caches (`policyDecisionSchema`).

---

## Fields

| Field | Type | Description |
| ----- | ---- | ----------- |
| `version` | `string` | Defaults to **`kirakira.decision.v1`**. |
| `decision_id` | `string` | Idempotent handle for audit correlation and approval records. |
| `request_id` | `string` | Echoes originating `PolicyInput.request_id`. |
| `effect` | `policyEffectSchema` | Outcome discriminator: **`allow`**, **`deny`**, or **`escalate`**. See [effects](#effects). |
| `reason_codes` | `string[]` | Stable machine-readable code list for dashboards, suppression rules, ticketing; first element SHOULD be canonical primary rationale if multiple exist (convention—not schema-enforced). |
| `policy` | object | Evaluated bundle attribution. |
| `policy.bundle_id` | `string` | OPA bundle artifact id controlling this decision. |
| `policy.revision` | `string` | Immutable revision slug / digest suffix. |
| `policy.package` | `string` | Logical policy package partition name. |
| `approval` | object | PDP-level approval latch separate from granular obligation entries. See [approval object](#approval-sub-object). |
| `obligations` | array | Executable constraints; validated by **`obligationSchema`**. Empty for pure deny when nothing must run. See [obligation types](#obligation-types). |
| `explain` | object | Transparency payload for admins / escalations — not trusted as security input downstream. |
| `explain.summary` | `string` | Short natural language justification. |
| `explain.matched_rules` | `string[]` | Rule paths or identifiers that materially contributed (`data.kirakira.shell.deny_critical`, …). |

---

## Effects

| Value | Semantics |
| ----- | --------- |
| **`allow`** | Execution MAY proceed ONLY after **`obligations`** (sandbox transition, approvals, auditing hooks) satisfy success criteria defined by orchestration. PEP MUST NOT skip obligation enforcement stage. |
| **`deny`** | Hard refusal; PEP MUST abort side-effecting invocation. Obligations SHOULD generally be empty; residual obligations indicate exceptional compensating controls (telemetry-only) reserved for future bundles—consumers SHOULD treat unsolicited obligations on deny as errors unless documented. |
| **`escalate`** | Decision cannot finalize without additional human/policy workflow (bundle gap, contradictory signals, PDP unable to certify). PEP MUST block dangerous operations until escalation resolves via new evaluation or superseding decision artifact. Interpretation parallels deny for automatic execution semantics but surfaces distinct UX/logging. |

---

## Approval sub-object

Controls whether an approval handshake blocks enforcement even when `effect === "allow"`.

| Field | Type | Description |
| ----- | ---- | ----------- |
| `required` | `boolean` | If **`true`**, obligation executor / PEP MUST obtain a corresponding approval lifecycle record BEFORE irreversible invocation. Should align with presence of **`approval`**-type obligations but may stand alone when bundle compresses duplication. |
| `mode` | `approvalModeSchema` | How approval adjudication behaves. See [modes](#approval-modes). |
| `template_id` | `string` optional | When `mode === "template"`, deterministic template keyed for sticky approval hashing. |
| `cacheable` | `boolean` | Whether PDP authorizes similarity / fingerprint caches to reuse future approvals absent explicit re-prompt semantics. |
| `ttl_seconds` | `number` optional | Temporal bound governing cache or approval validity horizon (paired with Approval Manager logic). |

### Approval modes

| Mode | Intended semantics |
| ---- | ------------------ |
| **`none`** | No human gate; PDP relies solely on deterministic rules plus automated obligations (`required` SHOULD be **`false`**). Typical read-only/low-risk allowances. |
| **`human`** | Interactive reviewer pathway (interactive terminal UI / web inbox). Usually coupled with **`required: true`** and/or `approval` obligations with human scope semantics. |
| **`auto`** | Automated arbiter agent or risk scoring service issues binding approval without synchronous human keystroke—but still audited as an approval artifact distinct from PDP internal logic (policy-defined). |
| **`template`** | Pre-approved parameterized pattern identified by **`template_id`**, enabling rapid re-permit similar actions under fingerprint families while retaining audit deltas. |

---

## Obligation types

Each obligation is `{ type }` plus optional fields from `obligationSchema`: **`profile`**, **`policy`**, **`channel`**, **`required`**, **`scope`**, **`min_length`**, **`domains`** (`policyScopeSchema` values: **`once`**, **`session`**, **`workspace`**, **`policy-window`**).

Scopes describe how long sticky controls or exemptions apply independent of PEP-specific caching.

### 1. `sandbox`

| Typical parameters | Purpose |
| ------------------ | ------- |
| `profile` (**primary**) | Canonical **`SandboxProfile.name`** PDP selected (e.g. `workspace-write`, `workspace-write-net`). |
| `scope` optional | Prefer reusing same sandbox profile transitions across related actions inside session/workspace window. |

Forces Sandbox Manager isolation before PEP exec.

### 2. `approval`

| Typical parameters | Purpose |
| ------------------ | ------- |
| `required` | HARD gate boolean mirroring PDP strictness granular to this obligation entry. |
| `scope` | Validity aperture for delegated auto-approve or recurring human acknowledgement. |

Augments PDP `approval` object when differentiated per obligation lineage is required.

### 3. `trace_redaction`

| Typical parameters | Purpose |
| ------------------ | ------- |
| `policy` | Redaction classifier id / policy fragment reference applied to OTLP trace export pipelines. |

### 4. `audit_append`

| Typical parameters | Purpose |
| ------------------ | ------- |
| `policy` | Additional structured snippet key or templated augmentation payload reference for audit ledger enrichment. |

### 5. `reason_required`

| Typical parameters | Purpose |
| ------------------ | ------- |
| `min_length` | Minimum user/agent justification character threshold before enqueueing approval prompt. |

### 6. `copyout_review`

| Typical parameters | Purpose |
| ------------------ | ------- |
| `required` | If true, copy-out from sandbox mandates post-hoc reviewer sign-off aligning with SandboxProfile `copyout.require_post_review`. |

### 7. `network_allowlist`

| Typical parameters | Purpose |
| ------------------ | ------- |
| `domains` | Supplemental PDP-permitted egress host patterns applied at network PEP stratum. |
| `required` | Obligation MUST NOT be weakened by PEP heuristics. |

### 8. `secret_projection`

| Typical parameters | Purpose |
| ------------------ | ------- |
| `profile` optional | Vault profile grouping allowed secret injections. |
| `policy` optional | Narrow allow-list key pattern / rotation policy slug. |

Governs KMS / agent secret ephemeral injection surfaces under sandbox posture.

### 9. `notify`

| Typical parameters | Purpose |
| ------------------ | ------- |
| `channel` | Notification sink (`slack.policy`, `pagerduty.low`, webhook id). |

Fire-and-forget obligation for security awareness / dual-control workflows.

*(When multiple optional fields coexist, PDP authors SHOULD document precedence in bundle README to avoid divergence between Rego compilers.)*

---

## AiriskOutput (`kirakira.airisk.v1`)

Emitted between normalization and PDP hardening stages (`airiskOutputSchema`). Downstream PDP policies SHOULD consume stable scalar fields—not free-form narrative—even if surfaced to humans elsewhere.

### Root fields

| Field | Type | Description |
| ----- | ---- | ----------- |
| `version` | `string` | Defaults **`kirakira.airisk.v1`**. |
| `request_id` | `string` | Matches tied `PolicyInput.request_id`. |
| `classification` | object | Core semantic summarization feeding Rego. |
| `claims` | array | Probabilistic / ranked risk assertions with evidence payloads. |
| `recommended_obligations` | `string[]` | Advisory obligation **type names** PDP MAY treat as prioritized suggestions (non-binding until bundle maps them). |
| `canonical_fingerprint_material` | object optional | Material for hashing sticky approvals (`action_family`, `write_paths`, `network_domains`, `tool_type`). |

### `classification` object

| Field | Type | Description |
| ----- | ---- | ----------- |
| `action_family` | `string` | Compressed intent label (`fs.write_workspace`, `package_install_registry`, …) independent of superficial argv differences. |
| `side_effect_level` | `none` \| `low` \| `medium` \| `high` | Estimated blast radius heuristic. |
| `destructive` | `boolean` | Aligns logically with normalized destructive flag yet may reconcile multiple signals (MCP semantics). |
| `network_required` | `boolean` | AIRISK egress necessity assessment. |
| `external_content_dependency` | `boolean` | Inference path touched unverified fetched content/web/toolchain. |
| `secret_exposure_risk` | `none` \| `low` \| `medium` \| `high` | Likelihood secret material surfaces improperly. |
| `workspace_escape_risk` | `none` \| `low` \| `medium` \| `high` | Paths/context indicate crossing workspace containment. |
| `supply_chain_risk` | `none` \| `low` \| `medium` \| `high` | Downloads / unresolved provenance exposures. |

### `claims[]` entries

| Field | Type | Description |
| ----- | ---- | ----------- |
| `code` | `string` | Stable taxonomy id (`PIPE_TO_SHELL`, …). |
| `severity` | `low` \| `medium` \| `high` \| `critical` | Claim severity grading. |
| `confidence` | `number` 0–1 | Model/rule ensemble confidence scalar. |
| `evidence` | `string[]` | Supporting extracted spans (hashed content ids, snippet references). |

---

## Example — deny (`shell` abuse pattern)

```json
{
  "version": "kirakira.decision.v1",
  "decision_id": "dec_01JH8XK7M8N9P0Q1R2S",
  "request_id": "req_01JH8XK7M8N9P",
  "effect": "deny",
  "reason_codes": ["DENY_SHELL_CURL_PIPE_BASH", "POLICY_HARD_BLOCK_REMOTE_EXEC"],
  "policy": {
    "bundle_id": "kirakira-default",
    "revision": "2026.05.05.003",
    "package": "kirakira.agent.core"
  },
  "approval": {
    "required": false,
    "mode": "none",
    "cacheable": false
  },
  "obligations": [],
  "explain": {
    "summary": "Remote installer retrieved over HTTPS piped directly into interpreter; blocked by deterministic high-risk pipeline rule.",
    "matched_rules": ["data.kirakira.shell.deny_curl_pipe_bash"]
  }
}
```

---

## Example — allow + sandbox & approval obligations

```json
{
  "version": "kirakira.decision.v1",
  "decision_id": "dec_01JH8XK8N9P0Q2R3S4T",
  "request_id": "req_01JH8XK8N9PQ",
  "effect": "allow",
  "reason_codes": ["ALLOW_PACKAGE_INSTALL_SCOPED_NET_ALLOWLIST"],
  "policy": {
    "bundle_id": "kirakira-default",
    "revision": "2026.05.05.003",
    "package": "kirakira.agent.core"
  },
  "approval": {
    "required": true,
    "mode": "human",
    "cacheable": true,
    "ttl_seconds": 3600,
    "template_id": "tmpl_workspace_net_install_session"
  },
  "obligations": [
    {
      "type": "sandbox",
      "profile": "workspace-write-net",
      "scope": "session"
    },
    {
      "type": "approval",
      "required": true,
      "scope": "session"
    },
    {
      "type": "network_allowlist",
      "domains": ["registry.npmjs.org", "*.npmmirror.com"],
      "required": true
    },
    {
      "type": "audit_append",
      "policy": "package_install_extended_v1",
      "required": true
    }
  ],
  "explain": {
    "summary": "Package installation permitted under isolated net-enabled sandbox contingent on human acknowledgement for this workspace session.",
    "matched_rules": [
      "data.kirakira.packages.allow_workspace_internal",
      "data.kirakira.approvals.human_floor_supply_chain_med"
    ]
  }
}
```

---

## Operational notes

- **Contract drift**: Bump document `version` literals only alongside coordinated PEP / bundle releases; never silently extend obligation semantics without widening schema in `packages/core/src/schemas/policy.ts`.
- **`escalate` vs obligations**: Consumers SHOULD treat escalate decisions as deny for automated execution scheduling until a superseding ALLOW artifact exists.
- **AIRISK outage**: Fallback classification paths SHOULD still populate minimal `classification` deterministic defaults (documented externally) rather than emitting partial objects violating Zod.
