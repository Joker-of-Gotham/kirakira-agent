# Daemon Delegate Runtime Bridge

Date: 2026-06-09

## Summary

The runtime daemon now wires kernel subagent tasks to a real ephemeral delegate runner instead of relying on the kernel's local fallback bridge.

## Changed

- Added `createDaemonDelegateRuntime` in `packages/runtime-daemon/src/bridge/runtime-deps.ts`.
- `KernelBridge` now creates a `DelegateRunnerSubagentBridge` backed by `createEphemeralDelegateRunner` by default.
- Delegate runtime events are appended to the daemon event store and forwarded through `KernelBridge.onEvent`.
- MCP configs are registered from `.mcp.json` when present, but this slice intentionally does not auto-start external MCP server processes.
- Runtime deps create fresh context assembly, skill injection, and tool executor state per delegate invocation to avoid cross-subagent state bleed during parallel fan-out.

## Design References

- LangGraph subgraphs separate parent/subgraph state schemas and namespace subagent state to avoid checkpoint collisions: https://docs.langchain.com/oss/javascript/langgraph/use-subgraphs
- LangChain router pattern supports parallel fan-out to specialized agents and result synthesis: https://docs.langchain.com/oss/javascript/langchain/multi-agent/router
- OpenAI Agents SDK documents "agents as tools" for nested agents that assist without fully handing off the conversation: https://openai.github.io/openai-agents-js/guides/tools/
- Deep Agents subagents are used for delegated work, context quarantine, specialization, and streamed subagent updates: https://docs.langchain.com/oss/python/deepagents/subagents

## Validation

- `pnpm.cmd --filter @kirakira/runtime-daemon typecheck`
- `pnpm.cmd --filter @kirakira/orchestrator-kernel typecheck`
- `pnpm.cmd vitest run test/unit/runtime-daemon/kernel-bridge-subagent.test.ts`
- `pnpm.cmd vitest run test/unit/orchestrator-kernel/subagent-contract.test.ts test/unit/orchestrator-kernel/daemon-orchestrator.test.ts test/unit/agent-runtime/react-loop-delegate.test.ts`
- `pnpm.cmd typecheck`
- `pnpm.cmd test`
