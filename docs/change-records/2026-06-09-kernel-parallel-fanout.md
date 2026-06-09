# Kernel Parallel Fanout

Date: 2026-06-09

## Context

Kirakira already normalized parallel plan cohorts into fanout/join graph edges, and
subagent tasks already routed to the delegated lane. The execution loop still
selected only the first ready node and awaited it before dispatching the next
ready node. That made subagent swarm plans structurally parallel but operationally
serial.

The EAM reference project has the same single-ready-node loop, so this slice
extends Kirakira beyond a direct file copy while preserving the same task graph,
lane routing, checkpoint, and event contracts.

## References

- LangGraph documents fan-out/fan-in parallel graph execution as a superstep
  pattern, with concurrency controlled by runtime configuration.
- LangChain's multi-agent router docs use parallel fan-out when a query should
  be sent to multiple specialized agents and synthesized afterward.
- MDN documents `Promise.all` and promise concurrency as the JavaScript standard
  pattern for starting independent async work before awaiting completion.

## Changes

- `KernelLoop` now maintains an in-flight task table and dispatches every ready
  node that fits an available lane before awaiting the next completion.
- `task_started` events are still emitted immediately per node, while
  `task_completed` / `task_failed` events are emitted in actual completion order.
- Lane capacity is now configurable through `KernelLoopDeps.laneCapacities` and
  `OrchestratorKernelOptions.laneCapacities`.
- Scheduler snapshots now keep `readyQueue`, `runningTasks`, and lane `pending`
  state aligned with the live parallel scheduler.
- The subagent executor test now proves two ready delegated subagent tasks start
  before either child resolves.

## Validation

- `pnpm.cmd vitest run test/unit/orchestrator-kernel/task-executor.test.ts`
- `pnpm.cmd --filter @kirakira/orchestrator-kernel typecheck`
- `pnpm.cmd vitest run test/unit/orchestrator-kernel/task-executor.test.ts test/unit/orchestrator-kernel/daemon-orchestrator.test.ts test/unit/orchestrator-kernel/subagent-contract.test.ts`
- `pnpm.cmd typecheck`
- `pnpm.cmd test`
- `git diff --check`
