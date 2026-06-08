# Runtime Capability Scope

## Request

Continue the EAM-parity and OpenHuman-informed subagent upgrade by making
subagent capability grants enforceable inside `agent-runtime`, not only present
in kernel plan contracts.

## External Baseline

- LangChain Deep Agents treats custom subagents as explicit specs with scoped
  tools, isolated skills, model overrides, and structured output channels.
- OpenAI Agents SDK handoffs are tool-like delegations with typed inputs,
  dynamic enablement, and input filtering.
- MCP security guidance requires access control, tool confirmation, validation,
  timeouts, and audit logging.
- Current MCP security research calls out implicit trust propagation and weak
  capability attestation as protocol-level risks, so child workers must have
  explicit grants that are checked before prompt exposure and execution.

## Files Changed

- `packages/agent-runtime/src/types.ts`
- `packages/agent-runtime/src/runtime-scope.ts`
- `packages/agent-runtime/src/index.ts`
- `packages/agent-runtime/src/context/assembler.ts`
- `packages/agent-runtime/src/context/skill-injector.ts`
- `packages/agent-runtime/src/tools/tool-executor.ts`
- `packages/agent-runtime/src/loop/react-loop.ts`
- `packages/agent-runtime/src/worker/ephemeral-worker.ts`
- `packages/agent-runtime/src/worker/delegate-runner.ts`
- `test/unit/agent-runtime/react-loop-delegate.test.ts`
- `test/unit/agent-runtime/capability-scope.test.ts`
- `test/unit/agent-runtime/tool-executor-scope.test.ts`

## Implementation Details

- Added `RuntimeCapabilityScope` as the runtime-normalized form of
  `SubagentCapability[]`.
- Added helpers to derive scopes from capabilities or worker config and to apply
  scopes back onto `ReactWorkerConfig`.
- `createEphemeralDelegateRunner` now derives a child scope from delegate
  capabilities, defaults missing capabilities to an empty isolated grant, applies
  model preference/runtime policy, and calls an optional `forkDeps` hook.
- `EphemeralWorker` carries the resolved scope into the child worker config.
- `ContextAssembler` defensively filters prompt-visible tool schemas and skills
  by worker scope, even when a shared `ToolSearchEngine` previously indexed
  broader parent tools.
- `reactLoop` denies out-of-scope tool calls and skill promotion before
  execution, so guessed tool names cannot bypass prompt filtering.
- `ToolExecutor` also denies out-of-scope tool calls before PEP or MCP requests.
  Exact tool grants are required for execution; MCP server grants do not
  automatically allow every tool on that server.
- Delegate action args can now carry capabilities, model preference, runtime
  policy, policy ceiling, input artifacts, and output schema into
  `DelegateRequest`.

## Remaining Risks

- `forkDeps` is now an explicit seam, but the default path still reuses parent
  deps where safe checks exist. The next hardening slice should provide a
  concrete forked context assembler, tool registry, skill injector, and MCP
  client view.
- The orchestrator kernel still needs a concrete `TaskExecutor` that routes
  `subagent` nodes through the scoped runtime bridge.
- Event projections still collapse most subagent trust metadata; a later UI
  milestone should project capabilities, policy, lineage, and child tool usage.

## Verification

- `pnpm.cmd vitest run test/unit/agent-runtime/react-loop-delegate.test.ts test/unit/agent-runtime/capability-scope.test.ts test/unit/agent-runtime/tool-executor-scope.test.ts test/unit/orchestrator-kernel/subagent-contract.test.ts`
  passed: 4 test files, 20 tests.
- `pnpm.cmd --filter @kirakira/agent-runtime typecheck` passed.
- `pnpm.cmd --filter @kirakira/orchestrator-kernel typecheck` passed.
- `pnpm.cmd --filter @kirakira/agent-runtime build` passed.
- `pnpm.cmd --filter @kirakira/orchestrator-kernel build` passed after the
  agent-runtime declaration build completed.
