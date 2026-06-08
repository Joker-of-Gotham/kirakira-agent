# Deep Research Substrate

## Request

Continue the EAM/OpenHuman parity upgrade by adding a provider-neutral deep
research substrate that can plan source-gated research, collect evidence from
injected adapters, and preserve citations from workspace memory without binding
Kirakira to one web, model, or memory backend.

## External Baseline

- OpenAI Deep Research API examples model deep research as multi-step planning,
  query enrichment, web search, MCP or internal file search, streamed progress,
  and final cited artifacts.
- OpenAI File Search documentation treats private corpora as a hosted retrieval
  tool over vector stores, separate from model provider configuration.
- LangChain Deep Agents subagent documentation emphasizes named specialist
  subagents with narrow tool sets and structured outputs that include sources.
- Deep Research Bench frames deep research as multi-step web tasks with explicit
  evaluation of hallucination, tool use, and source-grounded synthesis.
- OpenAI's 2026 Deep Research update describes trusted-source constraints,
  MCP/app connectors, live progress, and user steering during long research.
- OpenHuman's typed subagent contract keeps child results synthesis-ready with
  the headings: Answer, Evidence used, Actions taken, Open uncertainties,
  Failed tool calls, and Recommended next step.
- OpenHuman's memory source and chunk types preserve source kind, source
  identity, source references, metadata, and stable provenance without requiring
  Kirakira to copy OpenHuman's connector stack.

## Files Changed

- `packages/deep-research/package.json`
- `packages/deep-research/tsconfig.json`
- `packages/deep-research/tsup.config.ts`
- `packages/deep-research/src/constants.ts`
- `packages/deep-research/src/types.ts`
- `packages/deep-research/src/options.ts`
- `packages/deep-research/src/planner.ts`
- `packages/deep-research/src/memory.ts`
- `packages/deep-research/src/runner.ts`
- `packages/deep-research/src/index.ts`
- `test/unit/deep-research/planner.test.ts`
- `test/unit/deep-research/memory.test.ts`
- `pnpm-lock.yaml`

## Implementation Details

- Added `@kirakira/deep-research` as a new ESM workspace package with `tsup`
  build and strict `tsc` validation.
- Added `resolveDeepResearchOptions()` to normalize the existing
  `DeepResearchConfig` contract, enforce `workspace_dir` containment, clamp
  limits, and map `source_policy` to allowed source kinds.
- Added `createDeepResearchPlan()` for deterministic, provider-neutral research
  contracts: question, source policy, limits, required source kinds, citation
  schema, unknowns, typed task nodes, and a subagent output schema.
- Added `DeepResearchRunner` with injected `ResearchSourceAdapter` and
  `ResearchPlannerAdapter` ports. It performs no provider lookup, API-key
  lookup, or hardcoded model routing.
- Added `extractMemoryCitations()` to cite from `MemoryBundle` L2/L3 context
  evidence while preserving `traceId`, `queryId`, `sourceRecordId`, evidence
  IDs, artifact pointers, route names, scores, and raw spans.
- Added `memoryProviderFromService()` as a thin adapter over
  `Pick<MemoryService, "recall" | "explainRetrieval">`. It requests L3 memory
  recall and never imports `memory-service`, store, vector, or graph backends.
- Added unit coverage for config normalization, source-policy enforcement,
  verified citation behavior, disabled no-op behavior, injected source adapter
  collection, and memory citation extraction.

## Deferred

- Do not implement a concrete web search, browser, file-search, or model
  provider inside `@kirakira/deep-research`. Those must arrive through injected
  adapters or composition roots.
- Do not copy OpenHuman's Rust subagent runner, hardcoded specialist registry,
  connector list, raw archive storage, or UI citation chips into this package.
- Do not treat retrieval traces alone as sufficient citations. Source-grounded
  memory citations must continue to come from the original `MemoryBundle`.
- Defer cross-package event projection for deep research progress until the
  runner is connected to orchestrator execution.

## Verification

- `pnpm.cmd --filter @kirakira/deep-research typecheck` passed.
- `pnpm.cmd exec vitest run test/unit/deep-research test/contract/config/resolved-state-schema.test.ts`
  passed: 3 test files, 12 tests.
- `pnpm.cmd --filter @kirakira/deep-research build` passed.
