# Rego style guide — Kirakira policies

Consistency rules for PDP authors producing production bundles referenced in [`README.md`](./README.md).

---

## Structural conventions

| Rule | Rationale |
| ---- | --------- |
| **One concern per package** (`kirakira.shell`, `kirakira.install`) | Simplifies testing & ownership rotation |
| **Never log secrets inside `trace` builtins** | Redaction omissions leak |
| **Prefer `startswith`/`glob.match` wrappers** imported from `kirakira.util.paths` | Prevents symlink edge drift |
| **Deny wrappers return structured `msgs`** | Harmonize with `explain.matched_rules` |

---

## Naming

| Artifact | Convention |
| -------- | ----------- |
| Rule names | snake_case verbs: `deny_shell_pipe_to_shell` |
| Reasons | PascalCase enumerated codes surfaced to CLI: `ShellPipeRisk` mapped to lowercase machine codes externally |

Maintain mapping table externally for SIEM ingestion.

---

## Input document expectations

ALWAYS gate top-level absence:

```
pi := input.policy_input
aire := input.airisk
pi != null  # precondition package
```

Use defaulting helper:

```
default_workspace_root := concat("/", ["workspace"])
```

Avoid heavy JSON mutation—upstream normalization belongs in PEP/AIRISK.

---

## Approval integration

Reuse shared library:

```
needs_approval if {
    pi.action.kind == "shell.exec"
    aire.claims.destructive == true
}
```

Encode obligations via **structured objects** appended to unified `decision.obligations` builder pattern (pseudo):

```
append_obligation(profile, ...) { ... }
```

Actual construction occurs in bridging layer mapping Rego outputs → Go/TS structs.

---

## Testing

| Layer | Tooling |
| ----- | ------- |
| Unit Rego tests | `opa test policies/...` |

Golden vectors MUST include contradictory AIRISK signals (tests ensure explicit precedence).

Coverage targets (> **85% statement coverage** guideline) enforced in CI gates.

---

## Performance

Leverage **`with` optimizations** sparingly—profile first (`opa bench path.to.rule`).

---

## Cross-links

- Decision log bridging: [`decision-log.md`](./decision-log.md)
