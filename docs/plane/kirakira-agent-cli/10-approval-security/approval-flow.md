# Approval flow

## 1. Describe the action

Call sites build an **`ActionDescriptor`** (`packages/cli/src/approval/evaluator.ts`):

- `shell` — includes `command`, `scope` (`workspace` | `host`), `sandbox`, `risk`, `requestedBy`
- `mcp` — `server`, `transport`, `tool`, optional `url`, classification fields
- `write` — filesystem `path`, `operation`, optional `preview`

## 2. Evaluate policy

`evaluateApprovalNeeded(action, policy, sessionAllowlist)` returns `ApprovalEvaluation`:

- `required` boolean
- optional `ApprovalKind`
- `reason` string (e.g. `session_allowlist`, `host_denied`, `host_requires_approval`)

Session wins first: `sessionAllowlist.matches(command, "shell")` short-circuits approval.

Host shell consults `policy.shell.hostExecution` (`policyYamlSchema`).

## 3. Present a card

If approval is required, construct cards via **`card-builder.ts`** using `@kirakira/core` `generateApprovalId` and typed detail payloads (`ShellApproval`, `McpApproval`, `WriteApproval`).

## 4. Capture decision

`processApprovalDecision` (`decision.ts`) handles `allow_once`, `allow_session`, `deny`, `deny_block`, `details` variants (`ApprovalDecision` union).

## 5. Allowlist updates

`allow_session` calls `sessionAllowlist.grant(pattern, kind)` for subsequent fast passes.

## Observability

Emit spans `approval.wait` / `approval.decision` (`packages/core/src/types/trace.ts`, `constants.ts`) and JSONL `approval.requested` / `approval.decided` (`schemas/output.ts`).
