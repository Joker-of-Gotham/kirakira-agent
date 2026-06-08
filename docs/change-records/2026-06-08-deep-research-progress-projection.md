# Deep Research Progress Projection

## Request

Continue the EAM/OpenHuman parity upgrade after the provider-neutral deep
research substrate by making research planning, task progress, source
collection, evidence, citations, limits, and completion replayable through the
event store and visible through frontend/TUI projections.

## External Baseline

- OpenAI Deep Research API documentation treats deep research as long-running
  source-grounded work over web search, file search, vector stores, remote MCP,
  connectors, code interpreter, and explicit safety logging.
- OpenAI's Agents SDK cookbook streams deep research progress and models
  multi-agent research as triage, clarification, instruction building, and
  final research execution.
- OpenAI Agents SDK tracing records LLM generations, tool calls, handoffs,
  guardrails, and custom events, while allowing sensitive span data to be
  disabled or routed through custom processors.
- The latest MCP specification is 2025-11-25. It exposes progress tokens,
  structured logging levels, resources, and experimental durable tasks for
  expensive long-running work.
- LangChain Deep Agents subagents expose separate typed streaming projections
  for coordinator activity, delegated subagents, messages, tool calls, and
  values.
- OpenTelemetry traces use parent/child spans and immutable span context for
  operation identity across nested work.
- OpenHuman's research projection semantics keep research runs, task progress,
  evidence, citations, and compact citation summaries separate from raw
  transcripts and full tool payloads.

## Files Changed

- `packages/deep-research/src/types.ts`
- `packages/deep-research/src/runner.ts`
- `packages/event-store/src/types.ts`
- `packages/event-store/src/projector.ts`
- `packages/event-store/src/replay.ts`
- `packages/event-store/src/index.ts`
- `packages/frontend-core/src/projection.ts`
- `packages/frontend-core/src/index.ts`
- `packages/orchestrator-kernel/package.json`
- `packages/orchestrator-kernel/src/research/event-bridge.ts`
- `packages/orchestrator-kernel/src/index.ts`
- `packages/cli/src/tui/runtime-events.ts`
- `packages/cli/src/tui/hooks/useRuntimeStore.ts`
- `packages/cli/src/tui/App.tsx`
- `test/unit/deep-research/planner.test.ts`
- `test/unit/event-store/research-projector.test.ts`
- `test/unit/frontend-core/projection.test.ts`
- `test/unit/orchestrator-kernel/research-event-bridge.test.ts`
- `pnpm-lock.yaml`

## Implementation Details

- Added package-local `DeepResearchProgressEvent` and
  `DeepResearchProgressSink` types so `@kirakira/deep-research` can report
  lifecycle progress without importing event-store, orchestrator, provider, or
  frontend packages.
- Updated `DeepResearchRunner` to emit neutral progress phases for run start,
  plan creation, task start/completion/failure, source start/completion/failure,
  evidence collection, citation creation, limit handling, run completion, and
  run failure.
- Kept citation progress bounded by omitting raw spans from progress payloads;
  full citation provenance stays in the returned research result.
- Added durable `research.*` event kinds and `ResearchRunRecord` state to
  `@kirakira/event-store`, including task, evidence, citation, limit, and
  failure handling.
- Normalized old checkpoints by materializing `researchRuns` during replay and
  projection so existing event logs remain loadable.
- Added frontend-core research projection entities plus compact dashboard
  summaries with latest citation metadata and aggregate counts.
- Added an orchestrator-kernel `ResearchEventBridge` that translates neutral
  deep-research progress into bounded event-store payloads. It hashes the raw
  question, keeps only a short preview, caps strings, and sanitizes citation
  metadata to primitive values.
- Added TUI-local research view-model events and cloning support so future
  runtime screens can display research runs without depending on event-store
  internals.
- Added focused coverage for event-store projection/replay, frontend dashboard
  projection, deep-research progress ordering, raw-span omission, and
  orchestrator event translation.

## Deferred

- Do not wire a concrete web search, browser, file-search, MCP, model, or
  connector provider into `@kirakira/deep-research`. Providers still enter
  through injected adapters or composition roots.
- Do not expose raw prompts, full questions, raw citation spans, full documents,
  or tool payloads through durable progress events.
- Do not replace the existing TUI runtime event surface with event-store types;
  the TUI remains a local presentation runtime until a shared daemon stream is
  intentionally introduced.
- Defer Electron/web UI rendering of research runs until the projection
  contract has at least one concrete orchestrator composition path.

## Verification

- `pnpm.cmd --filter @kirakira/deep-research typecheck` passed.
- `pnpm.cmd --filter @kirakira/event-store typecheck` passed.
- `pnpm.cmd --filter @kirakira/frontend-core typecheck` passed.
- `pnpm.cmd --filter @kirakira/orchestrator-kernel typecheck` passed.
- `pnpm.cmd --filter @kirakira/cli typecheck` passed.
- `pnpm.cmd --filter @kirakira/deep-research build` passed.
- `pnpm.cmd --filter @kirakira/event-store build` passed.
- `pnpm.cmd --filter @kirakira/frontend-core build` passed.
- `pnpm.cmd --filter @kirakira/orchestrator-kernel build` passed.
- `pnpm.cmd --filter @kirakira/cli build` passed.
- `pnpm.cmd exec vitest run test/unit/deep-research/planner.test.ts test/unit/deep-research/memory.test.ts test/unit/event-store/research-projector.test.ts test/unit/event-store/subagent-projector.test.ts test/unit/frontend-core/projection.test.ts test/unit/orchestrator-kernel/research-event-bridge.test.ts`
  passed: 6 test files, 22 tests.
