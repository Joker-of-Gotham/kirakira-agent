# SandboxProfile (`kirakira.sandbox.v1`)

Declarative isolation contract invoked by PDP **`sandbox`** obligations and enforced by Sandbox Manager prior to PEP execution (`../08-sandbox/README.md`). Profiles are referenced by **`SandboxProfile.name`** inside [`policy-decision.md`](./policy-decision.md) obligations.

Canonical schema: `sandboxProfileSchema` in `packages/core/src/schemas/policy.ts`.

---

## Document shape

### Root fields

| Field | Type | Required | Description |
| ----- | ---- | --------- | ----------- |
| `version` | `string` | yes | **`kirakira.sandbox.v1`**. |
| `name` | `string` | yes | Unique catalog key (`workspace-readonly`, …). PDP references this verbatim. |
| `description` | `string` | optional | Operator-facing rationale. |
| `platforms` | `string[]` | yes | Selector subset: `linux`, `darwin`, `gvisor`, `firecracker`. |
| `filesystem` | object | yes | Mount allow/deny semantics. |
| `network` | object | yes | Egress stance. |
| `process` | object | yes | Syscall/seccomp lineage. |
| `secrets` | object | yes | Secret projection model. |
| `copyout` | object | optional | Controlled extraction of artifacts to host workspace. |

Sub-objects intentionally mirror **`08-sandbox/profile-catalog.md`** prose tables; PDP authors SHOULD keep JSON profiles synchronized with prose examples.

---

## `filesystem`

| Field | Type | Meaning |
| ----- | ---- | ------- |
| `workspace_mount` | `string` path | Canonical mount location inside sandbox (typically `/workspace`). |
| `read_only` | `boolean` | If `true`, bind workspace read-only—even when action requests write PEP. |
| `allow_paths_glob[]` | `string[]` | Additional explicit read binds (logging dirs, tmp scratch). |
| `deny_paths_glob[]` | `string[]` | Host paths never mounted (SSH keys, cloud cred stubs). |

---

## `network`

| Field | Type | Meaning |
| ----- | ---- | ------- |
| `mode` | enum | `none`, `egress_allowlist`, `full` (`full` SHOULD be PDP-rare). |
| `allowed_domains[]` | `string[]` | Required when mode `egress_allowlist`. |
| `dns_mode` | enum | `block`, `allowlist_resolver`, `system` |

**Alignment:** Mirrors obligation type `network_allowlist` layering—sandbox profile expresses baseline; PDP may tighten per request.

---

## `process`

| Field | Type | Meaning |
| ----- | ---- | ------- |
| `syscall_profile` | `string` | Maps to bundled seccomp BPF / `syscall allowlist.csv`. |
| `uid_map` | `string` | `rootless`, `nobody65534`, `dynamic`. |
| `capabilities` | `string[]` | Linux capability bounding set (typically empty). |
| `ptrace` | enum | `deny_by_default`. |

Backend mapping: [`../08-sandbox/platform-backends.md`](../08-sandbox/platform-backends.md).

---

## `secrets`

Models how ephemeral credentials appear inside sandbox namespaces without PEP echoing plaintext into prompts.

| Field | Type | Meaning |
| ----- | ---- | ------- |
| `mode` | enum | `none`, `projection`, `host_agent_socket`. |
| `projections[]` | object | `{ "name": "NPM_TOKEN", "source": "vault://..." }`. |

Collaborates with PDP obligation **`secret_projection`** ([`../09-obligation/README.md`](../09-obligation/README.md)).

---

## `copyout`

Describes sanctioned artifact egress (built binaries, junit XML, coverage) subject to PDP **`copyout_review`** obligations.

| Field | Type |
| ----- | ---- |
| `allowed_destinations_glob[]` | target paths under workspace |
| `requires_scan` | `boolean` antivirus / DLP hook |

---

## Example (illustrative / non-exhaustive)

```yaml
version: "kirakira.sandbox.v1"
name: "workspace-write-net-restricted"
description: "Write inside workspace clone; egress allowlist package managers only."
platforms: ["linux", "darwin"]
filesystem:
  workspace_mount: "/workspace"
  read_only: false
  deny_paths_glob:
    - "$HOME/.ssh/**"
network:
  mode: "egress_allowlist"
  allowed_domains:
    - "registry.npmjs.org"
    - "pypi.org"
process:
  syscall_profile: "kirakira-default-seccomp"
  uid_map: "nobody65534"
secrets:
  mode: "projection"
copyout:
  allowed_destinations_glob:
    - "/workspace/out/**"
  requires_scan: false
```

---

## Validation gates

Sandbox Manager SHOULD refuse activation if catalog entry:

- declares `network.mode=full` absent explicit signed waiver flag;
- mismatches detected host backend (Darwin profile scheduled on unsupported kernel).

Failures bubble as obligation **`abort`** → PEP fail-closed path ([`../10-fail-closed/README.md`](../10-fail-closed/README.md)).

---

## Multi-language alignment

Codegen expectations: [`./cross-language-alignment.md`](./cross-language-alignment.md).

---

## Cross-links

- Full preset catalog matrices: [`../08-sandbox/profile-catalog.md`](../08-sandbox/profile-catalog.md)
- Obligation interplay: [`../09-obligation/README.md`](../09-obligation/README.md)
