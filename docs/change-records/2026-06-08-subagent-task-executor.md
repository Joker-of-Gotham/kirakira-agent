# Subagent Task Executor

## Request

Continue the EAM/OpenHuman parity upgrade by wiring normalized orchestrator
`subagent` task nodes into the scoped runtime delegate bridge.

## External Baseline

- OpenAI Agents SDK handoffs model delegation as a structured, tool-like action
  with typed input and receiving-agent input filtering.
- LangChain Deep Agents defines subagents as explicit specs with scoped tools,
  isolated context, optional model overrides, and optional structured output.
- MCP structured logging keeps runtime diagnostics as structured notifications
  with client-controlled verbosity and access-control requirements.
- Current MCP security research highlights capability attestation and implicit
  trust propagation risks, so graph-created subagents must reuse explicit
  scope and policy contracts rather than inferred role permissions.

## Files Changed

- `packages/orchestrator-kernel/src/execution/subagent-task-executor.ts`
- `packages/orchestrator-kernel/src/index.ts`
- `test/unit/orchestrator-kernel/task-executor.test.ts`

## Implementation Details

- Added `SubagentTaskExecutor`, a decorator-style `TaskExecutor` that routes
  only `TaskNode.kind === "subagent"` through `RuntimeSubagentBridge.run`.
- Added `RuntimeTaskExecutionContext` and `getContext(node)` so run id,
  workspace root, parent worker config, optional parent worker id, and trace id
  come from the execution surface instead of being frozen into a reusable
  executor instance.
- Defaulted `parentWorkerId` to `parentConfig.id` when the execution context
  does not override it.
- Preserved the parent `ReactWorkerConfig` object unchanged. The executor does
  not synthesize workload type, model, role, tool scope, skill scope, or MCP
  allowlists.
- Required a fallback executor for non-subagent nodes, which keeps the
  normalized root `plan` node and future non-subagent graph work executable.
- Left daemon protocol and event projection changes out of this slice. Richer
  `subagent.spawned` / `subagent.completed` topology and scope fields should
  land as a separate event-store/frontend milestone.

## Verification

- `pnpm.cmd vitest run test/unit/orchestrator-kernel/subagent-contract.test.ts test/unit/orchestrator-kernel/task-executor.test.ts`
  passed: 2 test files, 12 tests.
- `pnpm.cmd --filter @kirakira/orchestrator-kernel typecheck` passed.
- `pnpm.cmd vitest run test/unit/orchestrator-kernel/subagent-contract.test.ts test/unit/orchestrator-kernel/task-executor.test.ts test/unit/agent-runtime/react-loop-delegate.test.ts`
  passed: 3 test files, 21 tests.
- `pnpm.cmd --filter @kirakira/orchestrator-kernel build` passed.
