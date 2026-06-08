# Runtime, Orchestration, And Presentation Baseline

## Request

The upgrade request covers four broad tracks:

- port later EAM mechanisms into Kirakira, including subagents, deep research,
  MCP design, and memory
- add future web and Electron desktop presentation surfaces while respecting the
  repository's local frontend design skills and the `reference_project/openhuman`
  reference
- reduce hardcoding and duplicated harness/config behavior
- unify Docker and host dependency/runtime surfaces

Four read-only subagents inspected EAM parity, frontend/openhuman, harness/API
hardcoding, and runtime dependency profiles. Their common conclusion was that
many EAM packages have already been name-migrated, but the active control planes
were still incomplete: subagent execution is not wired end-to-end, deep research
was not a runtime path, MCP defaults were path-hardcoded, provider defaults were
partly duplicated, and web/desktop needed a substrate before a visual system.

## External Baseline

The design baseline was checked against current public sources before editing:

- OpenAI Agents SDK handoffs: handoff is modeled as a tool with a destination,
  optional structured payload, and optional input filtering.
- OpenAI Agents SDK tracing: traces include LLM generations, tool calls,
  handoffs, guardrails, and custom events.
- Model Context Protocol 2025-11-25 spec: protocol messages are schema-defined,
  JSON Schema validated, and HTTP auth is explicit while stdio credentials come
  from environment.
- LangChain Deep Agents: deep-agent harnesses combine planning, subagents,
  virtual filesystems, context compression, MCP tools, long-term memory, and
  filesystem permissions.
- Docker Compose profiles: profile selection is a first-class Compose control
  surface via `--profile` or `COMPOSE_PROFILES`.
- Electron security docs: context isolation, renderer sandboxing, and narrow
  preload APIs are mandatory constraints for a future Electron shell.
- ReAct, Reflexion, AutoGen, and MemGPT papers: agent runtime should separate
  action/reasoning loops, feedback/reflection, multi-agent coordination, and
  tiered memory rather than hide those mechanisms in ad hoc prompts.

## Files Changed

- `agent.toml`
- `.env.example`
- `docker-compose.yml`
- `pnpm-workspace.yaml`
- `package.json`
- `configs/runtime/profiles.json`
- `configs/runtime/versions.json`
- `scripts/runtime-profile.mjs`
- `scripts/kirakira-common.mjs`
- `scripts/llm-providers.mjs`
- `packages/core/src/types/config.ts`
- `packages/core/src/schemas/config.ts`
- `packages/core/src/index.ts`
- `packages/config-resolver/src/resolved-state.ts`
- `packages/agent-runtime/src/types.ts`
- `packages/agent-runtime/src/index.ts`
- `packages/agent-runtime/src/context/assembler.ts`
- `packages/agent-runtime/src/worker/ephemeral-worker.ts`
- `packages/frontend-core/*`
- `test/contract/config/*`
- `test/fixtures/configs/agent.toml`
- `test/unit/frontend-core/projection.test.ts`
- `test/unit/runtime/profile-resolution.test.mjs`
- `test/unit/scripts/llm-providers.test.mjs`
- `docs/architecture.md`

## Implementation Details

- Added typed `orchestration`, `deep_research`, `runtime`, and `presentation`
  sections to the public config schema and resolver defaults.
- Made `agent.toml` declare subagent handoff policy, deep-research limits,
  runtime profiles, and future web/desktop presentation env keys.
- Replaced direct subagent prompt/turn-count constants in `EphemeralWorker` with
  `SubagentRuntimePolicy`, and cleared delegated task preambles after each run.
- Added canonical runtime profile and version files plus `scripts/runtime-profile.mjs`
  for env, compose, and MCP rendering.
- Made startup MCP defaults reuse the runtime profile renderer instead of owning
  a separate hardcoded path table.
- Moved Docker service credentials and runtime URLs behind `.env`/Compose
  interpolation while preserving current defaults.
- Added `@kirakira/frontend-core`, a dependency-light presentation contract and
  `RunEvent` projection package for future web and Electron renderers.
- Added `llm:select` and `runtime:profile` root scripts.
- Aligned the selector provider helper with CLI placeholder-key filtering and
  the missing `aliyun` alias.

## Remaining Risks

- Subagent swarm execution is still not wired from `react-loop`/kernel/CLI into
  `EphemeralWorker`.
- Deep research is now a typed configuration surface, but no research DAG/source
  policy executor exists yet.
- `apps/web` and `apps/desktop` are not scaffolded yet; visual implementation is
  intentionally gated on a design brief.
- Provider metadata still needs a true single manifest shared by TS scripts,
  CLI, config resolver, and Python gateway.
- Python gateway dependencies are still not first-class in the final Docker
  runtime image.
- CLI config defaults still need consolidation onto `@kirakira/config-resolver`.

## Verification

- `pnpm.cmd --filter @kirakira/core build` passed, refreshing the local core
  dist schema used by package-level tests.
- `pnpm.cmd vitest run test/unit/frontend-core/projection.test.ts test/unit/runtime/profile-resolution.test.ts test/unit/scripts/llm-providers.test.ts test/contract/config/resolved-state-schema.test.ts test/contract/config/agent-toml-compat.test.ts`
  passed: 5 test files, 13 tests.
- `pnpm.cmd --filter @kirakira/frontend-core build` passed.
- `pnpm.cmd --filter @kirakira/config-resolver typecheck` passed.
- `pnpm.cmd --filter @kirakira/agent-runtime typecheck` passed.
- `node scripts/runtime-profile.mjs env host` rendered host profile env values
  with localhost service URLs and host MCP roots.
- `node scripts/runtime-profile.mjs mcp host` rendered host-oriented MCP defaults
  with `.` workspace roots and relative local MCP server paths.

The first attempt to run `pnpm install --offline --ignore-scripts` failed after
pnpm recreated `node_modules` because the local store lacked a required tarball.
A follow-up `pnpm install --ignore-scripts --no-frozen-lockfile` restored the
workspace links; it reused cached packages and changed `pnpm-lock.yaml` only by
adding the new `packages/frontend-core` importer.
