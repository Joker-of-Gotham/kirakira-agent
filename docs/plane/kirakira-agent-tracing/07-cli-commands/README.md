# Tracing & audit — CLI commands

Operator reference for inspecting **audit ledgers** and validating **SIEM export fixtures**.

Adjacent policy CLI: [`../../kirakira-agent-policy/11-cli-commands/README.md`](../../kirakira-agent-policy/11-cli-commands/README.md).

---

## `kirakira audit`

| Subcommand | Description |
| ---------- | ----------- |
| **`tail`** | Stream-append view like `journalctl -f` restricted to recent segment |
| **`show`** | Render JSON pretty single record seq range |
| **`verify`** | Recompute BLAKE3 chain locally [`../04-audit-ledger/hash-chain-spec.md`](../04-audit-ledger/hash-chain-spec.md) |
| **`export`** | Emit ECS-wrapped newline JSON for indexer dry-run pipelines |
| **`checkpoint-sign`** | Operator/HSM-assisted checkpoint signing workflows [`../04-audit-ledger/signing-spec.md`](../04-audit-ledger/signing-spec.md) |

### Examples

```bash
kirakira audit tail --workspace ws_ci_04 --follow

kirakira audit verify --segment /var/kirakira-audit/live/segment-202605050900.ss

kirakira audit export --since 2026-05-01T00:00:00Z --format ecs-jsonl > /tmp/siem-batch.jsonl
```

---

## `kirakira siem`

| Subcommand | Description |
| ---------- | ----------- |
| **`test-rule`** | Replay synthetic ECS sample through local detection evaluator plugin |
| **`export`** | Package curated dashboards + parsers zip for Splunk/Elastics app bundle |

Example:

```bash
kirakira siem test-rule \
  --rule ./siem/rules/D-06-egress-storm.dsl \
  --fixture ./fixtures/ci-egress-spike-ecs.ndjson

kirakira siem export --vendor splunk \
  --out ./artifacts/spl-kirakira-integration-v2026.05.05.tar.gz
```

---

## Common flags & exit codes

| Flag | Meaning |
| ---- | ------- |
| `--json` | Machine mode |
| `--workspace` | Filter scope |

| Exit | Meaning |
| ---- | ------- |
| 10 | Integrity verification FAILED |
| 11 | Rule evaluation detected synthetic violation (test harness) |

---

## Security cautions

`export` can surface sensitive summaries—enforce RBAC ACL on command invocation in shared jump hosts.

Prefer short-lived SSO-wrapped escalation tokens.

---

## Cross-links

Remote anchoring steps post-export [`../04-audit-ledger/remote-anchoring.md`](../04-audit-ledger/remote-anchoring.md)
