# File PEP

Guards **`file.write`**, patching APIs, scaffold generators, and recursive deletes. Enforces **`workspace.root` containment**, symlink policies, and atomic replace semantics.

Upstream context: [`README.md`](./README.md).

---

## Interception vectors

| API surface | PEP hook |
| ----------- | -------- |
| `open(O_CREAT|O_WRONLY)` family | VFS shim, LD_PRELOAD, or language-specific I/O interceptor |
| Structured patch apply | SCM / diff library instrumentation |

Hooks MUST canonicalize filesystem paths **before** approval fingerprint hashing.

---

## Workspace boundary enforcement

Normalization sketch:

```
abs_path = canonical_realpath(candidate)
root = PolicyInput.workspace.root
if !(abs_path == root || abs_path.startswith(root + path_separator)):
    emit risk.workspace_escape_candidate = true
```

| Edge case | Recommendation |
| --------- | ------------- |
| Symlink chaining | Resolve final target; bundles may disallow symlinks escaping root |
| Case sensitivity (`/Workspace` vs `/workspace`) | Use OS-aware canonicalization primitives |
| Windows junctions | Map to unified path model before PDP evaluation |

PDP denies or escalates via bundle rules such as `data.kirakira.file.deny_escape`.

---

## Write classification

Populate **`action.normalized`** with deterministic metadata:

| Field | Purpose |
| ----- | ------- |
| `targets[]` | Resolved absolute destinations |
| `operation` semantic | `create`, `overwrite`, `mkdir`, `delete_tree` |

Binary vs textual classification informs downstream trace redaction (see [`../../kirakira-agent-tracing/03-sampling-redaction/README.md`](../../kirakira-agent-tracing/03-sampling-redaction/README.md)).

---

## Coordination with MCP file roots

MCP-hosted virtual filesystems that overlap the workspace MUST reuse the **same canonical path normalization** rules as native file hooks to avoid contradictory PDP outcomes for identical absolute paths.

---

## Telemetry

Suggested tracing attributes bridge to [`../../kirakira-agent-tracing/02-span-taxonomy/kirakira-custom-attributes.md`](../../kirakira-agent-tracing/02-span-taxonomy/kirakira-custom-attributes.md):

| Attribute | Description |
| --------- | ----------- |
| `kirakira.pep.file.targets_count` | Number of discrete write destinations |
| `kirakira.pep.file.patch_format` | e.g., `unified-diff`, `rewrite` |

---

## Failure semantics

Incomplete metadata (`stat` race, transient ENOENT during patch apply) SHOULD set `risk=file_metadata_unavailable`. PDP bundles SHOULD treat unresolved destructive intents as **fail-closed** outcomes per [`../10-fail-closed/README.md`](../10-fail-closed/README.md).
