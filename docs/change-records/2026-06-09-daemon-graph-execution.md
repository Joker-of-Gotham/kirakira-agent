# Daemon Graph Execution

## Summary

Daemon run submission now starts the orchestrator `KernelLoop` instead of
publishing a fixed one-worker graph stub.

The daemon orchestrator now:

- compiles a run plan through an injectable planner
- normalizes and executes the graph through `KernelLoop`
- routes subagent nodes through `SubagentTaskExecutor`
- emits runtime-contract events for plan, graph, task, subagent, checkpoint, and
  run lifecycle updates
- keeps the default path deterministic and local so daemon startup does not
  depend on an external model planner

## Why

The kernel already had graph, scheduler, and subagent execution primitives, but
daemon submission only registered a single synthetic worker and emitted a
one-node graph. This disconnected the web/Electron runtime from real graph and
subagent lifecycle events.

## Verification

- `pnpm.cmd exec vitest run test/unit/orchestrator-kernel/daemon-orchestrator.test.ts`
- `pnpm.cmd exec vitest run test/unit/orchestrator-kernel/daemon-orchestrator.test.ts test/unit/orchestrator-kernel/task-executor.test.ts test/unit/orchestrator-kernel/subagent-contract.test.ts test/unit/frontend-core/projection.test.ts test/unit/runtime-daemon/browser-gateway-server.test.ts`
- `pnpm.cmd --filter @kirakira/orchestrator-kernel typecheck`
- `pnpm.cmd --filter @kirakira/runtime-daemon typecheck`
- `pnpm.cmd test`
- `pnpm.cmd typecheck`
