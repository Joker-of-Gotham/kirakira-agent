# Skill PEP

Execute **declarative SKILL automations** (often interpreted bash/Python/Node) with interpreter pinning, cryptographic verification against registry manifests, and baseline sandbox escalation.

Treat skills as **`untrusted` external packages** per [`../01-threat-model/README.md`](../01-threat-model/README.md).

Upstream context: [`README.md`](./README.md).

---

## Lifecycle interception

```mermaid
flowchart LR
  DISC[Discover skill bundle] --> VAL[Interpreter + lock verification]
  VAL --> PEP[Normalize PolicyInput]
  PEP --> KIRAKIRAD[Evaluate via kirakirad]
```

| Checkpoint | Requirement |
| ---------- | ----------- |
| **Skill root containment** | Path must reside under configured trusted skill directories |
| **Interpreter allowlist** | Executable path hash / version gates |
| **Dependency lock parity** | If `skill.lock.toml` declares pins, drifting resolution is `risk.lock_violation` |

Failures produce deterministic `reason_codes` such as `skill.interpreter_mismatch`.

---

## PolicyInput mapping

Populate:

| Field | Value |
| ----- | ----- |
| `tool_type` | `skill-script` |
| `operation` | Derived from front-matter slug `run.cmd` normalization |
| `context.skill` optional | `{ "id": "...", "version": "1.4.2" }` |

Downstream interpreters may still shells out; SKILL remains **primary PEP** owning the span ancestry.

---

## Sandboxing posture

Baseline obligations attach **`sandbox` profile**: `skills-restricted` (see [`../08-sandbox/profile-catalog.md`](../08-sandbox/profile-catalog.md)).

Escalations (needs network/registry) funnel through PDP rather than SKILL self-declaring allowances.

---

## Supply chain parallels

Analogous safeguards to [`registry-pep.md`](./registry-pep.md): tarball signatures, provenance attestations (`../05-pdp-opa/bundle-signing.md` patterns reused at skill artifact scope).

---

## Observability expectations

Mandatory attributes (see tracing custom attrs doc):

| Key | Meaning |
| --- | ------- |
| `kirakira.skill.id` | Namespaced slug |
| `kirakira.skill.digest` | BLAKE3/SHA256 of normalized bundle |

Child shell spans SHOULD include `kirakira.parent.pep = skill`.
