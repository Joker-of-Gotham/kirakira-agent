# Orchestrator Subagent Contract Bridge

## Request

Continue the EAM-parity upgrade by moving subagent execution from an isolated
runtime delegate seam toward a kernel-owned swarm contract.

## External Baseline

- OpenAI Agents SDK handoffs treat delegation as a structured, tool-like action
  with typed input and optional input filtering.
- LangChain Deep Agents models subagents as explicit specs with isolated
  context, scoped tools/skills, model overrides, and optional structured output
  returned to the parent.
- MCP 2025-11-25 tool guidance requires input validation, access control,
  confirmations for sensitive operations, timeouts, and audit logging.
- Current MCP security research highlights capability attestation and implicit
  trust propagation risks, so child capability scopes must be explicit and
  policy-checked rather than inferred from hardcoded roles.

## Files Changed

- `packages/agent-runtime/src/loop/react-loop.ts`
- `packages/orchestrator-kernel/src/types.ts`
- `packages/orchestrator-kernel/src/compiler/goal-compiler.ts`
- `packages/orchestrator-kernel/src/compiler/plan-normalizer.ts`
- `packages/orchestrator-kernel/src/subagent/contract.ts`
- `packages/orchestrator-kernel/src/subagent/runtime-bridge.ts`
- `packages/orchestrator-kernel/src/subagent/factory.ts`
- `packages/orchestrator-kernel/src/subagent/inheritance.ts`
- `packages/orchestrator-kernel/src/index.ts`
- `test/unit/orchestrator-kernel/subagent-contract.test.ts`

## Implementation Details

- Added `SubagentTaskContract` for plan-time subagent work: task brief,
  explicit capabilities, model preference, runtime policy, policy ceiling,
  input artifacts, and optional output schema.
- Extended planner JSON hydration to preserve subagent scopes and contract
  fields instead of dropping them.
- Updated graph normalization so `subagent` nodes receive a normalized contract.
  Unscoped subagents now default to no capabilities instead of inheriting every
  available tool or skill.
- Added capability validation against available tools, skills, and MCP servers.
  Unknown capabilities fail normalization.
- Added `subagentSpecFromTaskNode` and `DelegateRunnerSubagentBridge` so a
  normalized kernel node can be mapped into the agent-runtime `DelegateRunner`
  seam without hardcoded tool names, models, or roles.
- Extended `DelegateRequest` with optional parent task id, capabilities, model,
  runtime policy, policy ceiling, input artifacts, and output schema.
- Strengthened policy ceiling assertions to reject filesystem-write and shell
  escalation in addition to network escalation.

## Remaining Risks

- `KernelLoop` still executes through a generic `TaskExecutor`; a concrete
  subagent executor must call the new bridge for `TaskNode.kind === "subagent"`.
- Child runtime deps are still shared by default. The next runtime-scoping patch
  should add a forked deps/capability-scope API before parallel subagent fanout.
- Daemon events still need a richer dotted event contract for swarm topology,
  progress, child tool calls, deep research sources, and replay cursors.
- Deep research, MCP inventory/rate metadata, memory recall/citation injection,
  and presentation-agent routing still need to plug into this contract.

## Verification

- `pnpm.cmd --filter @kirakira/agent-runtime build` passed.
- `pnpm.cmd --filter @kirakira/agent-runtime typecheck` passed.
- `pnpm.cmd --filter @kirakira/orchestrator-kernel typecheck` passed.
- `pnpm.cmd --filter @kirakira/orchestrator-kernel build` passed after the
  agent-runtime declaration build completed.
- `pnpm.cmd vitest run test/unit/orchestrator-kernel/subagent-contract.test.ts test/unit/agent-runtime/react-loop-delegate.test.ts test/unit/event-store/subagent-projector.test.ts test/unit/frontend-core/projection.test.ts`
  passed: 4 test files, 16 tests.
