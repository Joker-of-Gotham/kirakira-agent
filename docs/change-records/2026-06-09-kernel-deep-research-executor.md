# Kernel Deep Research Executor

Date: 2026-06-09

## Summary

Deep research is now a first-class orchestrator-kernel task kind. Planner output
can declare `research` steps, the normalizer preserves their contracts, the lane
router sends them to the background lane by default, and the daemon kernel can
execute them through injected `@kirakira/deep-research` adapters while emitting
durable `research.*` events.

## Changed

- Added `research` to the kernel task-kind schema and planner JSON contract.
- Added `ResearchTaskContract` so plans can describe questions, subquestions,
  source-kind requirements, audience, per-task deep-research config, and
  metadata without binding to concrete providers.
- Preserved `research` contracts through graph normalization.
- Routed research tasks to the `background` lane by default, with high
  interactive priority and explicit lane hints still taking precedence.
- Added `ResearchTaskExecutor`, which runs `DeepResearchRunner` with injected
  `ResearchSourceAdapter` and optional planner ports.
- Wired daemon execution as `subagent -> research -> fallback`, keeping
  subagent and ordinary task behavior unchanged.
- Bounded task outputs to status, counts, source policy, citation metadata, and
  truncated summaries. Raw evidence content and citation raw spans are omitted
  from durable task results.

## Design References

- OpenAI Deep Research API guidance models deep research as long-running,
  source-grounded work over web search, file search/vector stores, or remote
  MCP, with cost controls such as `max_tool_calls` and background execution for
  long runs: https://developers.openai.com/api/docs/guides/deep-research
- LangChain Deep Agents deep research decomposes research into focused
  subquestions, isolated subagents, source assessment, and cited synthesis:
  https://docs.langchain.com/oss/python/deepagents/deep-research
- LangChain Open Deep Research keeps provider, search tool, and MCP choices
  configurable rather than hardwired into the agent loop:
  https://github.com/langchain-ai/open_deep_research
- Anthropic's multi-agent research write-up describes orchestrator-worker
  research, parallel breadth-first exploration, separate contexts, and high
  token/tool-call cost, supporting Kirakira's background-lane default:
  https://www.anthropic.com/engineering/multi-agent-research-system

## Boundaries

- This slice does not start web search, browser, file-search, or MCP services.
  Concrete source implementations still enter through injected adapters at the
  composition root.
- Research events still go through `ResearchEventBridge`, which hashes and
  previews the question and sanitizes citation metadata.
- Live web validation must use Kirakira's explicit workbench ports
  `http://127.0.0.1:5183`, `http://127.0.0.1:5174`, and
  `ws://127.0.0.1:17373/runtime`. A listener on `127.0.0.1:5173` is unrelated
  to this repository and is not validation evidence.

## Validation

- `pnpm.cmd --filter @kirakira/orchestrator-kernel typecheck`
- `pnpm.cmd vitest run test/unit/orchestrator-kernel/task-executor.test.ts test/unit/orchestrator-kernel/subagent-contract.test.ts test/unit/orchestrator-kernel/daemon-orchestrator.test.ts test/unit/orchestrator-kernel/research-event-bridge.test.ts test/unit/deep-research/planner.test.ts`
