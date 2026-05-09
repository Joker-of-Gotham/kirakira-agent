# Platform sandbox backends

Mapping abstract [`SandboxProfile`](../03-data-model/sandbox-profile.md) knobs to Linux, macOS, gVisor, Firecracker primitives.

Legend: ✅ supported, ⚠ partial, 🔜 roadmap.

---

## Comparison table

| Feature | Linux (nsjail + seccomp + cgroups) | macOS sandbox-exec (Seatbelt) | gVisor (runsc) | Firecracker µVM |
| ------- | ----------------------------------- | ----------------------------- | -------------- | ---------------- |
| PID namespace isolation | ✅ | ⚠ traces differ | ✅ | ✅ |
| Network NS default off | ✅ | Integrated via denial patterns | ✅ | ✅ |
| Seccomp BPF | ✅ | N/A | Synthetic kernel filters | ✅ (KVM filtered) |
| cgroup v2 quotas | ✅ | ⚠ surrogate (mac resource limits weaker) | relies on outer orchestrator | outer cgroups |
| FS bind read-only enforcement | ✅ mount flags | sandbox profile directives | OverlayFS emulation | virtio-fs snapshot |
| Dev velocity | ✅ best | ⚠ entitlement friction | ⚠ heavier cold start | highest operational cost |

---

## Linux — nsjail + seccomp + cgroups

### Components

| Layer | Role |
| ----- | ----- |
| **nsjail** | Assembles mount, UID map, cgroup membership |
| **seccomp** | Loads syscall allow/deny BPF from profile bundle |
| **cgroups v2** | CPU/mem/pids throttle preventing fork bombs |

Sample invocation sketch (**illustrative, not runnable verbatim**):

```bash
nsjail \
  -Mo \
  --chroot /srv/jail/root \
  --disable_clone_newnet \
  --iface_no_lo \
  --cgroup_mem_max 536870912 \
  --/seccomp-policy /etc/kirakira/seccomp/workspace-write-net.json \
  -- /bin/sh -lc "npm ci"
```

### Operational notes

- Pin nsjail + libseccomp versions in golden images (supply chain reproducibility).
- Validate mount table diff vs profile catalog nightly.

---

## macOS — `sandbox-exec` Seatbelt profiles

### Strategy

Represent each Kirakira logical profile via compiled **sandbox profile plist** subsets:

```
(version 1)
(deny default)
(allow network-outbound (remote tcp "*:443") ) ;; optional pattern expansion
...
```

Complex network globbing ⚠ weaker than nftables equivalents—compensate with **VPN-level egress controls** corp-wide.

### Entitlements hurdles

Interactive dev machines may reject seatbelt escalation—surface via `kirakira sandbox doctor` warnings.

---

## gVisor (runsc)

### When to adopt

Elevated APT simulation, partially trusted WASM transpilation servers, multitenant runners.

Characteristics:

| Benefit | Caveat |
| ------- | ------- |
| User-space kernel mitigates many syscall abuse classes | Compatibility gaps (fcntl flags, ioctl surface) |

Run profiles:

```
runsc --network=none --rootless ...
```

Networking toggled per PDP via outer CNI bridging.

Integration often nested: cgroup outer → runsc sandbox inner.

---

## Firecracker microVM

### Suitability

Profile `#7 microvm-strong-isolation` workloads; minimizes host kernel shared attack surface vs containers.

Operational pattern:

```
snapshot pre-baked minimal rootfs + virtio-fs mapped workspace subtree clone
CPU pins + THP off per security guidance optional
```

### Lifecycle costs

Cold start dominates—warm pools recommended for CI harness.

---

## Feature detection & doctor command

Recommended checks:

| Signal | Interpretation |
| ------ | ------------- |
| `kernel.unprivileged_userns_clone=0` break nsjail | Prompt admin enable or fallback |
| `seatbelt_profiles_missing` mac | Partial degrade |
| `kvm` inaccessible | disallow Firecracker pathway |

Expose structured JSON lines for telemetry pipeline.

---

## Cross-links

- Fail-closed when backend missing prerequisites: [`../10-fail-closed/README.md`](../10-fail-closed/README.md)
