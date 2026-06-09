# Daemon Deep Research Composition

Date: 2026-06-09

## Summary

The runtime daemon can now compose kernel deep research from the resolved
Kirakira config and explicit source ports. This closes the gap between the
kernel-level `research` task executor and daemon startup without hardcoding a
web provider, MCP server, database, Redis, S3, vector store, or graph backend.

## Changed

- Added `createDaemonDeepResearchKernelOptions()` in
  `packages/runtime-daemon/src/bridge/deep-research.ts`.
- `KernelBridgeOptions` now accepts:
  - `resolvedConfig` for `agentToml.deep_research` defaults.
  - `deepResearch` for daemon-level source adapters, planners, and memory
    source ports.
- The daemon composition merges deep-research config in this order:
  resolved config, existing kernel options, daemon options, then per-task
  research config inside the orchestrator executor.
- Added `DaemonMemoryResearchSourceOptions`, which converts an injected
  `MemoryRecallPort` into a `memory` `ResearchSourceAdapter`.
- `DaemonLifecycle` now accepts `kernel?: KernelBridgeOptions` and passes it to
  `KernelBridge`.
- `@kirakira/runtime-daemon` now declares `@kirakira/deep-research` as an
  explicit workspace dependency because it composes deep-research adapters
  directly.

## Design References

- OpenAI Deep Research guidance recommends background execution for long
  research tasks, `max_tool_calls` for cost/latency control, and private data
  access through file search/vector stores, connectors, or remote MCP
  search/fetch surfaces:
  https://developers.openai.com/api/docs/guides/deep-research
- OpenAI's remote MCP guidance for deep research requires read-only search and
  fetch semantics for private data sources, which maps to Kirakira's injected
  adapter port rather than a hardcoded provider:
  https://developers.openai.com/api/docs/guides/deep-research
- The latest MCP specification, version 2025-11-25, frames MCP as a JSON-RPC
  protocol for resources, tools, prompts, progress, cancellation, and security
  controls. Kirakira keeps daemon research adapters explicit so host-level
  consent and source boundaries remain at the composition root:
  https://modelcontextprotocol.io/specification/2025-11-25
- LangChain Open Deep Research keeps model, search tool, and MCP choices
  configurable across providers and search backends:
  https://github.com/langchain-ai/open_deep_research
- Anthropic's multi-agent research system emphasizes dynamic research paths,
  parallel contexts, memory handoffs, and high tool/token cost, supporting the
  current background-lane and explicit-budget design:
  https://www.anthropic.com/engineering/multi-agent-research-system
- "Bridging Protocol and Production" notes that production MCP deployments need
  identity propagation, adaptive budgeting, structured errors, and
  observability beyond the base protocol. The daemon memory source therefore
  accepts dynamic tenant/workspace/run/session values from the task context:
  https://arxiv.org/abs/2603.13417

## Boundaries

- This slice does not construct `MemoryServiceImpl`. Database, Redis, blob,
  vector, graph, and embedding clients still belong to explicit runtime
  composition.
- This slice does not auto-start external MCP servers or add a concrete web
  search provider.
- Memory tenant and workspace identity are required on the injected memory
  source; there is no fallback tenant or workspace id.
- Research task results still omit raw evidence content and raw citation-span
  fields.
- Live browser validation remains anchored on Kirakira ports
  `http://127.0.0.1:5183`, `http://127.0.0.1:5174`, and
  `ws://127.0.0.1:17373/runtime`. A listener on `127.0.0.1:5173` is not
  Kirakira validation evidence.

## Validation

- `pnpm.cmd --filter @kirakira/runtime-daemon typecheck`
- `pnpm.cmd vitest run test/unit/runtime-daemon/kernel-bridge-subagent.test.ts test/unit/orchestrator-kernel/daemon-orchestrator.test.ts test/unit/orchestrator-kernel/task-executor.test.ts test/unit/deep-research/memory.test.ts`
