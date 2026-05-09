# Threat Model — Kirakira Agent Policy Engine

This section describes **seven primary threat surfaces** for an enterprise CLI agent governed by PEPs + `kirakirad`, and catalogs **three categories of untrusted objects** feeding those surfaces. Detailed mitigations span [`../04-pep-layer`](../04-pep-layer), [`../05-pdp-opa`](../05-pdp-opa), [`../06-airisk`](../06-airisk), [`../07-approval`](../07-approval), [`../08-sandbox`](../08-sandbox), and [`../09-obligation`](../09-obligation).

## Design stance

Defense assumes **hosts may run untrusted model output alongside trusted enterprise policy**. The PEP boundary is authoritative: bypassing PEPs or `kirakirad` is equivalent to bypassing governance. Policy bundles (`../05-pdp-opa`), sandbox profiles (`../08-sandbox/README.md`), and the audit ledger ([`../../kirakira-agent-tracing/04-audit-ledger`](../../kirakira-agent-tracing/04-audit-ledger)) provide corroborating controls.

---

## Seven threat surfaces

### 1. Prompt injection & context poisoning

**Description.** Adversarial or accidental content embedded in retrieval results, MCP tool outputs, pasted issues, markdown instructions, or model history steers tools toward unintended actions.

**Primary controls.** AIRISK classifications for content provenance hints, PDP deny/escalate rules, approvals with human-readable deltas, separation of trusted policy data from retrieved context (`../06-airisk`).

### 2. Tool & capability abuse

**Description.** Powerful tools (shell, `apply_patch`, destructive MCP verbs, lifecycle APIs) misuse capabilities within session scope—even without leaving the workspace.

**Primary controls.** Action normalization, destructive-op detection in MCP PEP (`../04-pep-layer/mcp-pep.md`), obligation-required sandbox upgrades, PDP reason codes tied to semantic tool classes.

### 3. Data exfiltration

**Description.** Encoded payloads in logs, outgoing network (`curl`, MCP callbacks), pasted secrets, telemetry oversampling exposing payload bodies.

**Primary controls.** Network PEP allowlists (`../04-pep-layer/network-pep.md`), PDP `network_allowlist` obligations (`../09-obligation`), trace redaction & sampling (`../../kirakira-agent-tracing/03-sampling-redaction`).

### 4. Workspace escape & path abuse

**Description.** Writes/symlinks/relative paths escaping `workspace.root`; reading sensitive host paths adjacent to clones.

**Primary controls.** File PEP boundary checks (`../04-pep-layer/file-pep.md`), sandbox filesystem mounts (`../08-sandbox/profile-catalog.md`), Rego canonical path rules.

### 5. Supply chain & registry compromise

**Description.** Trojan skills, compromised registry tarballs, unsigned or stale policy bundles, dependency confusion.

**Primary controls.** Registry PEP (`../04-pep-layer/registry-pep.md`), bundle signing (`../05-pdp-opa/bundle-signing.md`), lockfiles & provenance (see [`../kirakira-agent-registry`](../kirakira-agent-registry) when present).

### 6. Sandbox bypass & misconfiguration

**Description.** Over-broad namespaces, misplaced bind mounts, missing seccomp/AppArmor equivalents, permissive egress inside “restricted” profiles.

**Primary controls.** Profile catalog conformance tests (`../08-sandbox/profile-catalog.md`), platform backend guides (`../08-sandbox/platform-backends.md`), fail-closed degrade paths (`../10-fail-closed`).

### 7. Credential theft & token misuse

**Description.** MCP OAuth passthrough misuse, scraping env vars, injecting key material into prompts, approving exfil payloads.

**Primary controls.** Model/MCP PEP trust tiers (`../04-pep-layer/model-pep.md`, `../04-pep-layer/mcp-pep.md`), **`secret_projection`** obligations (`../09-obligation`), vault-backed secret slots in sandbox specs.

---

## Three categories of untrusted objects

| Category | Definition | Typical instances | PDP posture |
| -------- | ----------- | ----------------- | ----------- |
| **User input & chat** | Text the user typed or pasted, including directives to the agent | Slash commands, paste blocks, inlined code | Assume untrusted narrative; PEP still evaluates resulting *actions* |

| **External tools & packages** | Code or binaries not authored by enterprise policy authors | MCP servers, npm/pypi wheels, SKILL scripts | Default high-friction: sandbox + approval floors |

| **Network content & tool output** | Any bytes crossing the trust boundary from remote systems | HTTP bodies, MCP `content[]`, RSS/search snippets | AIRISK tagging + PDP egress & content-handling obligations |

Agents must treat **combinations** of the above as especially dangerous—for example pasted install scripts **and** outbound network concurrently.

---

## Threat surface summary table

| # | Threat surface | Example technique | Desired signal to PDP/AIRISK | Leading control |
|---|----------------|-------------------|--------------------------------|----------------|
| 1 | Prompt injection | Hidden tool-use instructions inside HTML | `context_provenance.external`, `risk.injection_signals` | Deny-or-escalate + approval summary |
| 2 | Tool abuse | `git push --force` via shell | `action.kind`, normalized argv | PDP shell rules + approval |
| 3 | Data exfiltration | Base64-ing secrets to logger | egress domains, obligations | Network PEP + audit redaction |
| 4 | Workspace escape | `../../etc/passwd` write | canonical path vs workspace | File PEP + FS profile |
| 5 | Supply chain | Typosquat package | registry trust tier, signature | Registry PEP + signed bundles |
| 6 | Sandbox bypass | Missing network namespace | profile drift detection | Sandbox doctor + fail-closed |
| 7 | Credential theft | MCP token echoed to tool args | MCP trust tier | Deny destructive + secret obligations |

---

## Cross-links

- Architecture response to threats: [`../02-architecture/README.md`](../02-architecture/README.md)
- Operator recovery when controls fail partially: [`../10-fail-closed/README.md`](../10-fail-closed/README.md)
- Telemetry that preserves evidence without leaking payloads: [`../../kirakira-agent-tracing/03-sampling-redaction`](../../kirakira-agent-tracing/03-sampling-redaction)
