# Approval card UI specification — TUI

Canonical layout for **`kirakira`** terminal prompts when PDP requires human adjudication (`approval.mode = human`).

Goals: concise risk summary, cryptographic transparency, reproducible keystrokes (<200ms cognition for expert users).

---

## Card anatomy

```
┌ Kirakira Approval — shell.exec ──────────────────────────────┐
│ Risk: NETWORK + WRITE (supply chain MEDIUM)               │
│ Command: npm install lodash@4.17.21                       │
│ Targets: workspace node_modules/**                        │
│ Fingerprint BLAKE3: ab12…9f                               │
│ Policy bundle: corp-default@2026.05.04-8f92c81            │
│ [y] approve once   [Y] approve session   [n] deny         │
│ [p] peek diff      [o] sandbox profile view               │
│ auto-expire in: 119s                                       │
└──────────────────────────────────────────────────────────┘
```

---

## Mandatory fields

| Field | Source |
| ----- | ------- |
| **Title line** | `action.kind`, `tool_type`, `tool_name` |
| **Risk chips** | Render top N `AiriskOutput.classifications` humanized |
| **Primary payload preview** | Truncated `normalized` excerpt (ANSI safe) |
| **Fingerprint preview** | First/last nibbles BLAKE3 |
| **Bundle id + revision** | `PolicyDecision.policy` |
| **Countdown TTL** | `ApprovalRecord.expires_at` countdown |

Truncate with middle ellipses; never wrap secrets.

---

## Quick keys 

| Key | Action | Notes |
| --- | ------- | ------ |
| `y` | Approve `scope=once` | Default safe path emphasis |
| `Shift+Y` | Approve **`session`** scoped | Alternate binding `Y` labeling environment-specific |
| `n` | Deny immediately | emits audit event `approval.denied` |
| `p` | **Peek**: paginated sanitized diff/output | Spawn `$PAGER`; non-mutating |
| `o` | Show effective **sandbox profile** summary textual | Loads profile catalog excerpt |
| `Ctrl+C` | Abort & mark `denied`/cancelled UX semantics | Mirrors fail-closed path |

Configurable alternative vim-style (`j/k`) NOT default to reduce accidental approvals.

Accessibility: audible bell optional on escalation states.

---

## Color semantics (subject to theme overrides)

| Color | Semantic |
| ----- | --------- |
| **Red foreground** | Destructive / irreversible classifications present |
| **Yellow** | Network side effects sans destructive |
| **Green hints** | Read-only classifications |

Maintain WCAG-compliant contrast ratios in default theme.

---

## Remote / CI mode

TTY absent ⇒ convert to **`JSON event`** plus exit code nonzero requiring structured approval via SSO portal (outside scope—hook interface defined in CLI doc).

---

## Persistence integration

Selecting approval writes [`ApprovalRecord`](../03-data-model/approval-record.md) BEFORE returning control to PEP; partial failures roll back spinner.

---

## Cross-links

- CLI surface: [`../11-cli-commands/README.md`](../11-cli-commands/README.md)
