# PolicyInput (`kirakira.policyinput.v1`)

`PolicyInput` is the PEP-facing **unified action model**. Every guarded capability converts to this structure prior to PDP evaluation (`policyInputSchema` in `packages/core/src/schemas/policy.ts`).

---

## Root fields

| Field | Type | Required | Description |
| ----- | ---- | --------- | ----------- |
| `version` | `string` | yes (default) | Stable contract id. Defaults to **`kirakira.policyinput.v1`**. |
| `request_id` | `string` | yes | Correlate ONE policy evaluation cycle with traces, PDP logs, approvals, and audit. Opaque UTF-8; see [identifiers](#identifiers). |
| `session_id` | `string` | yes | Stable agent/CLI session identity. |
| `trace_id` | `string` | yes | End-to-end trace correlation id (typically matches OpenTelemetry `trace_id` hex). |
| `timestamp` | `string` | yes | Request time — **ISO 8601** string (schema does not constrain further; callers should emit UTC timestamps). |
| `principal` | object | yes | Caller identity and posture. See [principal](#principal). |
| `workspace` | object | yes | Checked-out workspace envelope. See [workspace](#workspace). |
| `action` | object | yes | Uniform action semantics. See [action](#action). |
| `target` | object | optional | Protected resources acted upon (files, MCP resources, repos, etc.). See [target](#target). |
| `context` | object | optional | Provenance hints (who invoked whom, MCP server, skill, model, memoized prior PDP outcomes). See [context](#context). |
| `risk` | object | optional | PEP-computed heuristic signals passed as hints to interpreters; not authoritative over PDP rules. See [risk](#risk). |

---

## `principal`

Authenticated subject attempting the action.

| Field | Type | Required | Description |
| ----- | ---- | --------- | ----------- |
| `user_id` | `string` | yes | Canonical user principal id within the controlling org/control plane. |
| `org_id` | `string` | optional | Tenant or organization slug/id. |
| `roles` | `string[]` | yes | Role names from IdP/policy directory (possibly empty array). |
| `groups` | `string[]` | optional | Group identifiers supplemental to roles. |
| `authn_method` | `"sso"` \| `"api_key"` \| `"token"` | yes | Credential class at the PEP boundary. |
| `device_trust` | `"managed"` \| `"unmanaged"` \| `"unknown"` | yes | Device posture coarse label. |
| `interactive` | `boolean` | yes | Human-in-the-loop session vs entirely batch/automation-driven. Influences escalation and prompting policy. |

---

## `workspace`

Material scope for filesystem and VCS-relative rules.

| Field | Type | Required | Description |
| ----- | ---- | --------- | ----------- |
| `workspace_id` | `string` | yes | Stable id for workspace instance in policy data. |
| `root` | `string` | yes | Absolute filesystem path to workspace root on the PEP host. |
| `vcs` | object | optional | SCM snapshot for repo hygiene rules (`provider`, `branch`, `dirty`). |
| `vcs.provider` | `string` | (if `vcs`) | E.g. `git`. |
| `vcs.branch` | `string` | (if `vcs`) | Current branch ref. |
| `vcs.dirty` | `boolean` | (if `vcs`) | Working tree differs from HEAD. |
| `labels` | object | optional | Operational tags. |
| `labels.data_classification` | `string` | optional | Sensitivity tier label for egress rules. |
| `labels.repo_trust` | `string` | optional | Organizational trust grading for upstream dependencies. |

---

## `action`

Unified description of tool intent regardless of PEP channel.

### Top-level `action`

| Field | Type | Required | Description |
| ----- | ---- | --------- | ----------- |
| `kind` | `actionKindSchema` | yes | One of `tool.call`, `file.write`, `shell.exec`, `model.invoke`, `package.install`, `network.request`. |
| `tool_type` | `toolTypeSchema` | yes | Coarse PEP category: `shell`, `mcp`, `skill-script`, `file`, `model`, `registry`. |
| `tool_name` | `string` | yes | PEP-defined tool identifier (CLI command name, MCP server tool id composite, skill id, …). |
| `operation` | `string` | yes | Verb-level operation slug (e.g. `exec`, `apply_patch`, `invoke`). |
| `raw` | object | optional | Unprocessed parameters for auditors / interpreters. See [raw](#actionraw). |
| `normalized` | object | optional | Deterministic normalization for rules and hashing. See [normalized](#actionnormalized). |

### `action.raw`

Passthrough knobs not yet summarized into `normalized`.

| Field | Type | Description |
| ----- | ---- | ----------- |
| `command` | `string` | Original command-line string or equivalent (shell). |
| `args` | `string[]` | Tokenized argv tail. |
| `env` | `Record<string,string>` | Relevant subset of inherited environment forwarded for risk analysis (never blindly log secrets). |

### `action.normalized`

Structural representation used by deterministic rulesets and fingerprints. Defaults (empty arrays, numeric zero/false where applicable) MUST be coherent with “no normalization available” sentinel patterns your Rego adopts.

| Field | Type | Description |
| ----- | ---- | ----------- |
| `command_ast_hash` | `string` optional | Stable hash across parsed shell AST canon (if PEP shells parse). |
| `command_base` | `string` optional | Executable basename after PATH resolution semantics (implementation-defined string). |
| `flags` | `string[]` | Normalized POSIX-style flags excluding operands. |
| `subcommands` | `string[]` | Canonical sub-command chain (npm → install …). |
| `write_paths` | `string[]` | Resolved absolute/normalized filesystem paths slated for mutation. |
| `read_paths` | `string[]` | Resolved paths slated for reads affecting policy decisions. |
| `network` | object optional | Consolidated egress requirements. |
| `network.required` | `boolean` | Whether execution requires outbound network connectivity. |
| `network.domains` | `string[]` | FQDNs or matchers used by PDP allowlists (implementation-defined granularity). |
| `network.protocol` | `string` optional | Highest-level protocol slug (`https`, …). |
| `destructive` | `boolean` | Irreversible/high-impact mutation flag (purge, destructive git, remote deletion tooling, …). |
| `interpreter_handoff` | `boolean` | Piped or embedded script execution implying execution beyond argv surface. |
| `pipeline_depth` | `number` | Count of sequential shell pipelines — `0` for single-stage. |
| `redirection_targets` | `string[]` | Files or fds receiving redirected output/input from shell normalization. |

---

## `target`

Resource-centric view when action affects concrete assets.

| Field | Type | Description |
| ----- | ---- | ----------- |
| `resource_type` | `string` | PDP vocabulary key (`fs.path`, `mcp.capability`, `model.endpoint`, …). |
| `resources` | array | Targets of that type. |

Each element:

| Field | Type | Required | Description |
| ----- | ---- | --------- | ----------- |
| `id` | `string` | yes | Stable locator (URI-ish, MCP resource id). |
| `owner` | `string` optional | Steward id for ownership-based rules. |
| `classification` | `string` optional | Confidentiality/tag label for PDP conditionals. |

---

## `context`

Cross-cutting lineage for agent orchestration integrations.

| Field | Type | Description |
| ----- | ---- | ----------- |
| `source` | `string` optional | PEP or subsystem name emitting the submission. |
| `invoker` | `string` optional | Immediate parent capability id (`main-agent`, delegated skill id…). |
| `subagent_id` | `string` optional | Isolated delegated execution context id. |
| `mcp_server` | object optional | MCP provenance subset. Fields: optional `id`, `issuer`, `trust_tier`. |
| `skill` | object optional | Loaded skill attribution: optional `id`, `version`, `fingerprint`. |
| `model` | object optional | Model invocation: optional `provider`, `model`. |
| `prior_decisions` | object optional | Short-circuit caches; `fingerprint_hit` / `approval_template_hit` booleans signalling sticky approvals reused. |

---

## `risk`

Non-authoritative **hints** surfaced by PEP heuristics (NOT a substitute for AIRISK classifications).

| Field | Type | Description |
| ----- | ---- | ----------- |
| `interpreter_summary` | `string` optional | Short human synopsis for escalation UI (not PDP truth). |
| `signals` | `string[]` | Machine tags (`pipe_to_shell`, `curl_bash_chain`, …) supplied as auxiliary Rego signals. |

---

## Example — `shell.exec` (`npm install`)

Supply-chain-touching workspace write with outbound registry access assumed.

```json
{
  "version": "kirakira.policyinput.v1",
  "request_id": "req_01JH8XK4QZQ9V4N3M5P6R7T8VY",
  "session_id": "sess_01JH8XK4PZP6R3N2",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "timestamp": "2026-05-05T12:34:56.789Z",
  "principal": {
    "user_id": "u_dev_001",
    "org_id": "org_financial_graph",
    "roles": ["developer"],
    "groups": ["repo-contributors"],
    "authn_method": "sso",
    "device_trust": "managed",
    "interactive": true
  },
  "workspace": {
    "workspace_id": "ws_fg_main",
    "root": "/home/dev/workspace/Financial_Graph/app",
    "vcs": {
      "provider": "git",
      "branch": "feature/policy-v4",
      "dirty": true
    },
    "labels": {
      "data_classification": "internal",
      "repo_trust": "org-owned"
    }
  },
  "action": {
    "kind": "shell.exec",
    "tool_type": "shell",
    "tool_name": "bash.default",
    "operation": "exec",
    "raw": {
      "command": "npm install",
      "args": [],
      "env": {}
    },
    "normalized": {
      "command_base": "npm",
      "flags": [],
      "subcommands": ["install"],
      "write_paths": ["/home/dev/workspace/Financial_Graph/app/node_modules"],
      "read_paths": ["/home/dev/workspace/Financial_Graph/app/package.json"],
      "network": {
        "required": true,
        "domains": ["registry.npmjs.org"],
        "protocol": "https"
      },
      "destructive": false,
      "interpreter_handoff": false,
      "pipeline_depth": 0,
      "redirection_targets": []
    }
  },
  "target": {
    "resource_type": "fs.workspace",
    "resources": [{ "id": "path:Financial_Graph/app", "classification": "internal" }]
  },
  "context": {
    "source": "kirakira-agent.shell-pep",
    "invoker": "cursor.terminal"
  },
  "risk": {
    "signals": ["package_supply_chain_touch"]
  }
}
```

---

## Example — `tool.call` (MCP)

Assumes MCP tool invocation captured by MCP PEP with MCP context populated.

```json
{
  "version": "kirakira.policyinput.v1",
  "request_id": "req_01JH8XK5V2N9P8Q7R6S5T",
  "session_id": "sess_01JH8XK4PZP6R3N2",
  "trace_id": "6d224ec866e8486994cf8f8873db7f45",
  "timestamp": "2026-05-05T13:05:01.234Z",
  "principal": {
    "user_id": "u_dev_001",
    "roles": ["developer"],
    "authn_method": "sso",
    "device_trust": "managed",
    "interactive": true
  },
  "workspace": {
    "workspace_id": "ws_fg_main",
    "root": "/home/dev/workspace/Financial_Graph"
  },
  "action": {
    "kind": "tool.call",
    "tool_type": "mcp",
    "tool_name": "linear.create_issue",
    "operation": "mutate.issue",
    "raw": {},
    "normalized": {
      "flags": [],
      "subcommands": [],
      "write_paths": [],
      "read_paths": [],
      "destructive": false,
      "interpreter_handoff": false,
      "pipeline_depth": 0,
      "redirection_targets": [],
      "network": { "required": true, "domains": ["api.linear.app"] }
    }
  },
  "target": {
    "resource_type": "linear.issue",
    "resources": [{ "id": "linear://team/backend", "classification": "internal" }]
  },
  "context": {
    "mcp_server": {
      "id": "mcp.linear.prod",
      "issuer": "https://linear.app",
      "trust_tier": "org-signed"
    }
  }
}
```

---

## Identifiers

### `version`

Literal contract tag. PEPs SHOULD emit **`kirakira.policyinput.v1`** explicitly rather than omitting the field unless they rely on SDK defaults that hydrate the same literal.

### `request_id`

- **Type**: opaque non-empty Unicode string recommended to be ASCII.
- **Uniqueness**: MUST be unique per evaluate→decide pairing (regenerate before retry-after-deny unless your control plane semantics explicitly reuse approvals).
- **Format**: intentionally **NOT** mandated by schema; common patterns include ULID-prefix (`req_` + Crockford Base32 ULID), UUIDv7, or vendor ticket ids. Coordinating components log this string verbatim.
