# Approval and security

Risky operations—**host shell**, **MCP tool invocation**, **writes**, and **skill scripts**—flow through policy evaluation, structured cards, human/com automation decisions, and optional session allowlists.

## Modules (`packages/cli/src/approval/`)

| File | Role |
|------|------|
| `evaluator.ts` | `evaluateApprovalNeeded`, `ActionDescriptor` union |
| `policy-matcher.ts` | Shell allow/deny lists |
| `session-allowlist.ts` | Session-scoped grants |
| `decision.ts` | `processApprovalDecision` maps UI choice to effects |
| `card-builder.ts` | `buildShellApprovalCard`, `buildMcpApprovalCard`, `buildWriteApprovalCard` |

## Types

`ApprovalCard`, decisions, and pending queues: `packages/core/src/types/approval.ts`.

## Errors

`ApprovalDeniedError`, `SecurityError`, `PathTraversalError`: `packages/core/src/errors.ts`.

## Related docs

- [Approval flow](./approval-flow.md)
- [Trust model](./trust-model.md)
- [Security baseline](./security-baseline.md)
