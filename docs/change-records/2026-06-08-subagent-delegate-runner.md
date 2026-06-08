# Subagent Delegate Runner Seam

## Request

Continue moving Kirakira toward the requested EAM-parity agent runtime. The
previous baseline made subagent policy configurable, but `reactLoop` still
treated `delegate` as a placeholder and emitted `subagent.spawned` without
actually invoking a child agent.

## External Baseline

- OpenAI Agents SDK handoffs model delegation as a first-class tool-like action
  with structured payloads and optional input filtering.
- LangChain Deep Agents subagents isolate complex work in a separate context and
  return the result to the parent rather than merging all child tool calls into
  the parent context.
- MCP 2025-11-25 keeps tool contracts schema-defined and auth/credentials
  explicit, so delegated tool scope must remain a policy-driven capability
  contract rather than a hardcoded role list.

## Files Changed

- `packages/agent-runtime/src/loop/react-loop.ts`
- `packages/agent-runtime/src/worker/delegate-runner.ts`
- `packages/agent-runtime/src/index.ts`
- `packages/frontend-core/src/projection.ts`
- `test/unit/agent-runtime/react-loop-delegate.test.ts`
- `test/unit/event-store/subagent-projector.test.ts`
- `test/unit/frontend-core/projection.test.ts`

## Implementation Details

- Added `DelegateRunner`, `DelegateRequest`, and `DelegateResult` as the runtime
  seam for subagent execution. The request carries the live parent worker config
  so adapters do not capture stale parent state.
- `reactLoop` now extracts a delegated task from `args.task`, `args.brief`,
  `args.prompt`, `args.instruction`, or `output`.
- A configured delegate runner receives the parent worker/run id and action, and
  the child result is written back as the parent observation.
- Missing task, missing runner, returned child failure, or thrown runner errors
  now complete the delegate turn with an error observation instead of the old
  "pending upstream" placeholder.
- Delegation emits `subagent.spawned` and `subagent.completed` with a stable
  `subagentId`, child `workerId` when available, parent worker id, and either an
  output preview or `status: "failed"` plus error text. Child artifact refs are
  copied into both the parent observation and completion event payload. This
  reuses the existing event-store projection path instead of adding another
  event kind.
- Added `createEphemeralDelegateRunner`, an adapter from the new seam to the
  existing `EphemeralWorker`. Nested delegation is disabled by default and can
  be enabled explicitly.
- The frontend dashboard projection now treats `subagent.completed` with
  `status: "failed"` as a failed subagent entity.

## Remaining Risks

- The CLI/TUI still does not submit chat through the daemon/kernel path, so this
  seam is not yet active from the default user chat surface.
- The orchestrator kernel still needs an executor that maps `subagent` plan nodes
  to `createEphemeralDelegateRunner`.
- Capability inheritance is still represented by existing config/types, but the
  actual tool/skill/MCP allowlist must be enforced by the caller that constructs
  child runtime deps.
- Deep research still needs a DAG/source-policy executor on top of this seam.

## Verification

- `pnpm.cmd vitest run test/unit/agent-runtime/react-loop-delegate.test.ts test/unit/event-store/subagent-projector.test.ts test/unit/frontend-core/projection.test.ts`
  passed: 3 test files, 9 tests.
- `pnpm.cmd --filter @kirakira/agent-runtime typecheck` passed.
- `pnpm.cmd --filter @kirakira/event-store build` passed.
- `pnpm.cmd --filter @kirakira/frontend-core build` passed.
