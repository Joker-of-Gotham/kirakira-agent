# Subagent Topology Projection

## Request

Continue the EAM/OpenHuman parity upgrade after the subagent task executor by
making subagent lifecycle events preserve topology, scope, contract, and result
metadata through replay and UI projection.

## External Baseline

- OpenAI Agents SDK tracing models agent runs as traces with parent-linked spans
  and captures handoffs, tool calls, guardrails, and custom events.
- LangChain Deep Agents frontend streaming treats subagents as first-class
  stream entities with identity, status, messages, tool-call metadata, and
  results separate from the coordinator stream.
- MCP structured logging uses arbitrary JSON-serializable data with
  client-controlled verbosity and access-control requirements, which supports
  structured metadata without leaking full raw transcripts.
- OpenTelemetry represents traces as parent/child span DAGs and recommends
  carrying trace/span identity across process boundaries.
- OpenHuman's subagent lifecycle records stable child IDs, parent IDs, status,
  result/error, timestamps, and bounded previews while deferring full child
  command surfaces to higher-level orchestration.

## Files Changed

- `packages/agent-runtime/src/loop/react-loop.ts`
- `packages/agent-runtime/src/daemon-runtime.ts`
- `packages/event-store/src/types.ts`
- `packages/event-store/src/projector.ts`
- `packages/event-store/src/index.ts`
- `packages/frontend-core/src/projection.ts`
- `packages/frontend-core/src/index.ts`
- `packages/cli/src/tui/runtime-events.ts`
- `packages/cli/src/tui/hooks/useRuntimeStore.ts`
- `packages/cli/src/tui/App.tsx`
- `packages/cli/src/config/defaults.ts`
- `packages/orchestrator-kernel/src/types.ts`
- `packages/orchestrator-kernel/src/execution/kernel-loop.ts`
- `packages/orchestrator-kernel/src/subagent/runtime-bridge.ts`
- `test/unit/agent-runtime/daemon-runtime.test.ts`
- `test/unit/agent-runtime/react-loop-delegate.test.ts`
- `test/unit/event-store/subagent-projector.test.ts`
- `test/unit/frontend-core/projection.test.ts`
- `test/unit/orchestrator-kernel/subagent-contract.test.ts`
- `test/unit/orchestrator-kernel/task-executor.test.ts`

## Implementation Details

- Added `parentTaskId`, `lane`, and `traceId` to `DelegateRequest` and carried
  them through ReAct delegate runner calls and orchestrator bridge calls.
- Standardized ReAct `subagent.spawned` and `subagent.completed` payloads so
  success and failure branches preserve parent worker, parent task, lane, trace,
  capabilities, model preference, runtime policy, policy ceiling, input
  artifacts, and output schema.
- Changed daemon worker registration from a misleading `subagent.spawned` event
  to generic `task.started` / `task.completed` events with explicit `taskId`
  and `workerId`.
- Added `workerId` to orchestrator-kernel `task_started` events so kernel task,
  lane, worker, and trace views can correlate without inference.
- Expanded event-store `SubagentRecord` with topology fields plus nested
  `scope`, `contract`, and `result` records. The projector keeps legacy minimal
  payloads working and synthesizes completion-only records when replay starts
  after a spawn event.
- Added frontend-core `subagentDetails` as a top-level projection map while
  preserving the existing `entities.subagents[id]` phase map for compatibility.
- Mirrored nested subagent `scope`, `contract`, and `result` fields in the TUI
  view model and cloned them during reducer hydration and app snapshots.
- Aligned CLI `defaultAgentToml()` with the runtime/orchestration/profile
  defaults introduced in the profile baseline so `@kirakira/cli` typecheck can
  validate the TUI metadata changes.

## Deferred

- Do not add new daemon-only subagent control messages yet. Existing run
  control, subscribe, state, checkpoint, and event replay surfaces should remain
  the control plane until scoped daemon-backed subagent runs need a separate
  protocol.
- Do not expose raw prompts, tool arguments, tool outputs, or full child
  transcripts through topology events. Keep public events to identifiers,
  bounded previews, hashes or artifacts, and structured scope evidence.
- Defer OpenHuman-style persistent child threads, continue/resume commands,
  `wait` / `message_agent` / `close` surfaces, and per-child transcript routing
  until the event-store and presentation contract is stable.

## Verification

- `pnpm.cmd vitest run test/unit/agent-runtime/react-loop-delegate.test.ts test/unit/agent-runtime/daemon-runtime.test.ts test/unit/orchestrator-kernel/subagent-contract.test.ts test/unit/orchestrator-kernel/task-executor.test.ts test/unit/event-store/subagent-projector.test.ts test/unit/frontend-core/projection.test.ts`
  passed: 6 test files, 31 tests.
- `pnpm.cmd --filter @kirakira/agent-runtime typecheck` passed.
- `pnpm.cmd --filter @kirakira/event-store typecheck` passed.
- `pnpm.cmd --filter @kirakira/frontend-core typecheck` passed after rebuilding
  `@kirakira/event-store` declarations.
- `pnpm.cmd --filter @kirakira/orchestrator-kernel typecheck` passed after
  rebuilding `@kirakira/agent-runtime` declarations.
- `pnpm.cmd --filter @kirakira/cli typecheck` passed after aligning CLI
  defaults with the runtime profile baseline.
- `pnpm.cmd --filter @kirakira/event-store build` passed.
- `pnpm.cmd --filter @kirakira/agent-runtime build` passed.
- `pnpm.cmd --filter @kirakira/frontend-core build` passed.
- `pnpm.cmd --filter @kirakira/orchestrator-kernel build` passed.
- `pnpm.cmd --filter @kirakira/cli build` passed.
