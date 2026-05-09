# Sandbox profile catalog — seven canonical profiles

Machine semantics align with [`../03-data-model/sandbox-profile.md`](../03-data-model/sandbox-profile.md). Names are PDP-stable (`SandboxProfile.name`).

Legend:

| Axis | Levels |
| ---- | ------- |
| **FS** | `ro` read-only workspace, `rw` write workspace subtree, `none` isolate tmp only |
| **Network** | `off`, `allowlist`, `full` |
| **Process** | syscall profile shorthand (`minimal`, `default`, `build`) |
| **Secrets** | `none`, `projection` |
| **Copyout** | `none`, `workspace_out` sanitized artifact egress |

---

## Profile matrix

| # | `name` | Purpose | FS | Net | Process | Secrets | Copyout |
|---|--------|---------|----|-----|---------|---------|---------|
| 1 | `read-only-discovery` | Read-only exploration & search | `ro` workspace | `off` | `minimal` | `none` | `none` |
| 2 | `workspace-write-local` | Apply patches installs w/out network using pre-fetched caches | `rw` workspace | `off` | `default` | `projection` *(optional scoped)* | `workspace_out/**` *(safe globs)* |
| 3 | `workspace-write-net-restricted` | Package installs fetching registries only | `rw` workspace | `allowlist` `{registry fronts}` | `default` tightened DNS | `projection` npm/pypi tokens via vault | `workspace_out/tests/**` optional |
| 4 | `network-research-proxy` | Read-only FS but explicit network allowlist browsing | `ro` workspace | `allowlist` `{docs CDN, search API endpoints}` | `minimal` UDP/TCP egress limited | `none` | `none` |
| 5 | `skills-restricted` | SKILL script runner baseline | `rw` ephemeral scratch union mount | `off` baseline | `default` disallow ptrace | `none` *(skills must not escalate)* | restricted small output dir |
| 6 | `privileged-build-container` | Compilers/linkers heavier syscall surface | `rw` workspace + allowlisted toolchain cache dirs | `allowlist` broad registries/internal mirrors | `build` syscall set (+ `clone`,`unshare` carefully) | `projection` ephemeral signing keys | staged copyout scanned |
| 7 | `microvm-strong-isolation` | Untrusted ingestion / POC runs | virtio-fs narrow mount subset | configurable `allowlist/on` guarded | KVM microkernel filter | **`none`** in-guest plaintext secrets disallowed policy | audited copy queue |

Detailed per-axis narratives below augment matrix.

---

## 1 — `read-only-discovery`

| Axis | Specification |
| ---- | ------------- |
| **FS** | Bind workspace read-only (`/workspace`); disallow writes via mount flags + seccomp `open` disallow `O_CREAT` outside tmp |
| **Network** | `off` (`CLONE_NEWNET`) |
| **Process** | `minimal` denies `mount`, `pivot_root` |
| **Secrets** | `none` |
| **Copyout** | `none` |

Use for codebase Q&A tooling without installs.

---

## 2 — `workspace-write-local`

| Axis | Specification |
| ---- | ------------- |
| **FS** | `rw` confined to workspace; deny `../` escapes (see PEP) |
| **Network** | `off`; attempts raise kill signal + audit |
| **Process** | `default` excludes rare syscalls needing raw sockets |
| **Secrets** | `projection` MAY mount short-lived read-only FIFO for toolchain auth if PDP attaches `secret_projection` |
| **Copyout** | Artifacts confined to `/workspace/out/**` optional |

Supports offline patching & deterministic rebuilds referencing vendored caches.

---

## 3 — `workspace-write-net-restricted`

| Axis | Specification |
| ---- | ------------- |
| **FS** | `rw` workspace; ephemeral `/tmp` private |
| **Network** | `allowlist`: `registry.npmjs.org`, `registry.yarnpkg.com`, `pypi.org`, `files.pythonhosted.org`, org proxy host |
| **Process** | `default` plus DNS resolver restrictions (force org DNS-over-TLS optional) |
| **Secrets** | `projection`: scoped tokens only usable from package manager shim |
| **Copyout** | test reports / junit allowed under globs |

Default for **`npm ci`/`pip install`**.

---

## 4 — `network-research-proxy`

| Axis | Specification |
| ---- | ------------- |
| **FS** | `ro` workspace |
| **Network** | `allowlist`: documentation CDNs (`learn.*`, docs hosts), sanitized search aggregator APIs PDP enumerates |
| **Process** | `minimal`; block raw outbound non-443 except approved DoH resolver |
| **Secrets** | `none`; corporate forward proxy injected via ENV projection read-only |

Used when model must ingest remote references but MUST NOT mutate tree.

---

## 5 — `skills-restricted`

| Axis | Specification |
| ---- | ------------- |
| **FS** | Union mount ephemeral upper layer overlays read-only SKILL bundle root |
| **Network** | `off` baseline; skill requiring network ⇒ PDP denies / escalates to profile 3 or 7 |
| **Process** | `default` disallow `ptrace`, `bpf` |
| **Secrets** | `none` baseline |
| **Copyout** | Allow small text logs under `.kirakira/skill-out/**`

Aligns [`../04-pep-layer/skill-pep.md`](../04-pep-layer/skill-pep.md).

---

## 6 — `privileged-build-container`

| Axis | Specification |
| ---- | ------------- |
| **FS** | `rw` workspace + toolchain cache dirs (`/.cache/ccache` mapping optional) |
| **Network** | `allowlist` expanded (git smart HTTP(s), maven central mirror, internal apt) PDP curated |
| **Process** | `build` syscall profile (relax `mmap` PROT_EXEC constraints carefully) |
| **Secrets** | `projection` ephemeral code signing certs with HSM PKCS#11 socket forward |
| **Copyout** | `copyout_review` obligation likely for artifacts > threshold |

Highest privilege short of microVM; requires managed device posture.

---

## 7 — `microvm-strong-isolation`

| Axis | Specification |
| ---- | ------------- |
| **FS** | virtio-fs exposes **narrow subtree** cloned snapshot (avoid live host mutation) |
| **Network** | Optional `full` egress inside guest ONLY if PDP explicitly mandates research mode—default still `allowlist` |
| **Process** | microkernel filtered syscalls (`seccomp BPF` layered) |
| **Secrets** | `none` plaintext; secret retrieval via PDP-approved ephemeral proxy bridging |
| **Copyout** | Queue diff artifacts → host after malware scan obligation |

Chosen for ingestion of minimally trusted repos or captured exploit PoCs.

---

## Consistency audits

Quarterly reconcile table vs JSON schema fixtures & doctor command expectations (`kirakira sandbox doctor`).

---

## Cross-links

- Platform nuances: [`platform-backends.md`](./platform-backends.md)
- Obligation interplay: [`../09-obligation/README.md`](../09-obligation/README.md)
