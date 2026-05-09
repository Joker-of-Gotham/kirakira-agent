# OPA bundle structure

Bundles package Rego modules, **`data`** JSON scaffolding, Wasm binary (optional), manifests, signatures. This doc describes canonical layout consumed by **`kirakira policy verify-bundle`** and `kirakirad` loaders.

Upstream: [`README.md`](./README.md).

---

## Canonical directory layout

```
bundle/
├── .manifest.json          # OPA-compatible manifest (+ Kirakira extensions)
├── policies/
│   ├── kirakira/
│   │   ├── main.rego
│   │   └── ...
│   └── lib/
├── data/
│   ├── kirakira_defaults.json    # PDP static defaults
│   ├── models_allowlist.json
│   └── networks.json
├── wasm/
│   └── policy.wasm          # optional precompiled PDP
├── signatures/
│   ├── bundle.sigstore.json
└── README.vendor.md          # operational notes (non-authoritative)
```

---

## Manifest (`.manifest.json`)

Core keys:

| Key | Meaning |
| --- | ------- |
| `revision` | Git commit SHA or semver + build |
| `roots` | Rego roots (`["policies/kirakira"]`) |
| **`kirakira.bundle_id`** | Corporate distribution id synced with [`../03-data-model/policy-decision.md`](../03-data-model/policy-decision.md) `policy.bundle_id` |
| `metadata` | contact, classification tags |

Wasm builds embed manifest hash for reproducibility.

---

## Rego partitioning

Recommended package naming:

```
package kirakira.shell
package kirakira.mcp
package kirakira.file
...
package kirakira.util
```

Helper libraries remain **pure** (`data` only) preventing accidental network imports.

---

## Data files

| `data/` document | Purpose |
| ---------------- | ------- |
| `kirakira_defaults.json` | Baseline effect when specialized rules abstain (**should converge deny-by-default**) |
| `network_allow_workspace.json` | Network tiers per workspace label |
| `models_allowlist.json` | PDP Model PEP evaluation facts |

Facts MUST validate against JSON schemas checked in CI (future automated).

---

## Distribution formats

| Format | Consumers |
| ------- | --------- |
| **Tarball `.tgz`** | Air-gapped USB / object storage replication |
| **OCI image layer** | GitHub Container Registry, ECR |

---

## Hot reload semantics

`kirakirad` observes manifest hash change ⇒ atomically swaps working directory pointer; overlapping requests finish on prior bundle revision until draining completes.

Rollback = repoint symlink to earlier artifact + `SIG_VALID`.

---

## Cross-links

- Signing expectations: [`bundle-signing.md`](./bundle-signing.md)
- Rego authoring: [`rego-style-guide.md`](./rego-style-guide.md)
