# Policy engine — CLI commands

Reference for **`kirakira policy`**, **`kirakira approval`**, **`kirakira sandbox`**. Paths follow multi-command layout inspired by kubectl / docker UX.

Telemetry export flag patterns align with tracing docs [`../../kirakira-agent-tracing/07-cli-commands/README.md`](../../kirakira-agent-tracing/07-cli-commands/README.md).

---

## Common global flags

| Flag | Meaning |
| ---- | ------- |
| `--json` | Machine-readable stdout |
| `--workspace ID` | Scope context override |
| `--trace-id X` | Attach synthetic trace correlator |

---

## `kirakira policy`

| Subcommand | Description |
| ---------- | ----------- |
| **`eval`** | Submit local `policy_input.json`, print `PolicyDecision` |
| **`status`** | Show active bundle revision, PDP mode (wasm/ipc), last reload timestamps |
| **`verify-bundle`** | Cryptographic verification + structural manifest checks [`../05-pdp-opa/bundle-signing.md`](../05-pdp-opa/bundle-signing.md) |
| **`why`** | Explain last denial for failing `trace_id` (pulls PDP decision log excerpt) [`../05-pdp-opa/decision-log.md`](../05-pdp-opa/decision-log.md) |
| **`test`** | Run curated Rego `opa test` subset packaged with bundle artifact |
| **`replay`** | Re-feed historical `PolicyInput` + optional mutated AIRISK vector for RCA |

### Examples

```bash
kirakira policy verify-bundle --bundle ./corp-policy.tgz --rekor-verify

kirakira policy eval --input ./samples/shell_install.json \
  --emit obligations --json | jq .

kirakira policy why --trace-id 4bf92f3577b34da6a3ce929d0e0e4736 --summary
```

---

## `kirakira approval`

| Subcommand | Description |
| ---------- | ----------- |
| **`ls`** | Tabular pending + recent resolved approvals |
| **`show`** | Dump `ApprovalRecord` detail + fingerprint BLAKE3 |
| **`approve` / `deny`** | Manual adjudication bridging operator consoles |
| **`revoke`** | Invalidate scope bucket(s) proactively |
| **`prune`** | Garbage-collect expired entries & tombstones |

### Examples

```bash
kirakira approval ls --workspace ws_dev_01 --pending-only

kirakira approval approve --approval-id apr_8899 --scope session

kirakira approval revoke --fingerprint-prefix ab12cd --reason "credential rotation drill"
```

---

## `kirakira sandbox`

| Subcommand | Description |
| ---------- | ----------- |
| **`ls`** | Enumerate sandbox catalog entries synced locally |
| **`show`** | Display profile detail matrix vs live kernel capabilities |
| **`diff`** | Compare two profile JSON specs textual structural diff |
| **`doctor`** | Host readiness checks referencing [`../08-sandbox/platform-backends.md`](../08-sandbox/platform-backends.md) |

### Example

```bash
kirakira sandbox doctor --json --fix-suggestions-only
```

---

## Exit codes (normative guideline)

| Code | Meaning |
| ---- | ------- |
| 0 | Success |
| 1 | Generic CLI usage error |
| 2 | PDP / policy violation surfaced (eval deny) |
| 3 | Remote dependency failure verifying artifact |

Organizations MAY remap for automation—document deviations.

---

## Scripting ergonomics

All commands SHOULD support `--stdin-json` ingestion for piping CI harness outputs securely.

---

## Related documentation

| Area | Doc |
| ---- | ----- |
| Data contracts | [`../03-data-model`](../03-data-model) |
| Fail-closed | [`../10-fail-closed/README.md`](../10-fail-closed/README.md) |
