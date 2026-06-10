# EAM Parity Upgrade Roadmap

Date: 2026-06-10

This roadmap is the control surface for the four-track upgrade request. It is
not a substitute for implementation; every row must eventually point to a code
change, a validation command, and a pushed commit.

## Authoritative References

- MCP lifecycle and capability negotiation:
  https://modelcontextprotocol.io/specification/2025-11-25/server/tools
  https://modelcontextprotocol.io/specification/2025-11-25/schema
  https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle
- Docker Compose environment variables and precedence:
  https://docs.docker.com/compose/environment-variables/
  https://docs.docker.com/compose/how-tos/environment-variables/set-environment-variables/
- Electron context isolation and security:
  https://www.electronjs.org/docs/latest/tutorial/context-isolation
  https://www.electronjs.org/docs/latest/tutorial/security
- React derived rendering and accessible disclosure patterns:
  https://react.dev/reference/react/useMemo
  https://www.w3.org/WAI/ARIA/apg/patterns/accordion/
- LangGraph multi-agent and handoff patterns:
  https://langchain-ai.github.io/langgraph/tutorials/multi_agent/multi-agent-collaboration/
  https://docs.langchain.com/oss/javascript/langchain/multi-agent/handoffs
- OpenAI Agents SDK handoffs and guardrails:
  https://openai.github.io/openai-agents-js/guides/handoffs/
  https://openai.github.io/openai-agents-js/guides/guardrails/
- OpenTelemetry GenAI agent semantic conventions:
  https://opentelemetry.io/docs/specs/semconv/gen-ai/mcp/
  https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-agent-spans/
  https://opentelemetry.io/docs/specs/otel/context/api-propagators/
- W3C distributed context propagation:
  https://www.w3.org/TR/trace-context/
  https://www.w3.org/TR/baggage/
- Configuration layering and environment overrides:
  https://specifications.freedesktop.org/basedir-spec/latest/
  https://12factor.net/config
  https://nodejs.org/api/process.html#processenv
  https://toml.io/en/v1.0.0
- Runtime request/response correlation and typed protocol shapes:
  https://www.jsonrpc.org/specification
  https://www.rfc-editor.org/rfc/rfc6455
  https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions

## Current Distance

| Track | Current estimate | Evidence | Main remaining work |
| --- | ---: | --- | --- |
| EAM mechanism parity | 93% | EAM-like packages exist in `packages/*`; subagent, deep research, MCP, memory, policy, registry, and audit packages are present; MCP invocation, live discovery contracts, direct call event projection, daemon default memory recall construction, structured memory runtime profile state, declarative swarm topology projection, role-aware subagent lane routing/events, public topology manifest projection, topology PEP/audit context, deterministic subagent lineage and handoff edge IDs, bounded role defaults, concrete scoped agent-runtime child dependency forks, first-class agent-runtime delegate metadata fields, daemon-owned MCP tool gateway execution, profile/env-selected MCP OTel recorder plans, daemon-hosted SDK/OTLP export injection, live stdio/HTTP MCP propagation smoke coverage, profile-projected MCP research target discovery, profile-owned deep-research adapter gate suites, MCP `isError` versus transport-failure semantics, profile-owned runtime integration aggregate gate, single-run runtime-daemon composition smoke, renderer-level hydrated web/Electron visual QA with execution identity, a separate `runtime-full-lifecycle` gate, frontend topology view-model, workbench MCP directory view, daemon retain/reflect memory bridge, live isolated memory persistence gate, focused CLI provider/home-screen TUI coverage, typed reflect runtime events, launcher fail-fast supervision, runtime ready plan rendering, Python model-gateway provider catalog sharing, shared model metadata catalog parity, and repeatable EAM parity audits now exist. Directory-level parity reports `exact=22`, `equivalent=9`, `drift=0`, `missing=0`, `extra=4`; rename-aware file-level parity reports `exact=13`, `equivalent=8`, `drift=10`, `missing=0`, `extra=4`, so structure presence is not treated as behavioral parity and product namespace migration is not treated as mechanism drift. | Full Docker-backed lifecycle pass once Docker Desktop is available, live lifecycle-level daemon startup coverage, and ongoing source-adapter expansion as new transports/backends are added. |
| Web and Electron presentation | 88% | `apps/web`, `apps/desktop`, `packages/frontend-app`, and `packages/frontend-core` exist; workbench uses runtime gateway contracts, frontend-core preserves subagent role/requested-lane metadata, runtime manifests expose sanitized topology, the shared workbench renders swarm topology and MCP directory panels, a tested four-view workbench IA now covers Runs, Agents, Research, and Systems, selected-subagent drawers, citation ledgers, artifact detail cards, and visual-QA hooks are browser-safe frontend-core view models, `DESIGN.md` documents the token system, and `pnpm start:desktop` plans daemon + renderer + Electron shell with readiness gates plus a hidden Electron smoke mode. Smoke reports now expose explicit profile-derived targets for web `5183`, desktop renderer `5174`, and gateway `17373`, package-script coverage locks `dev:electron` to the built main/preload Electron path, the profile owns a web+desktop presentation smoke gate, a static presentation quality gate protects shared tokens, a11y anchors, Electron smoke content, visual-QA hooks, and OpenHuman boundary docs, `docs/upgrade/gates/presentation-render-evidence.json` proves the shared React renderer can SSR both Web and Desktop surfaces without touching runtime transport, `docs/upgrade/gates/presentation-hydrated-visual-qa.json` archives six hydrated screenshots across web/desktop and mobile/tablet/desktop viewports with zero console/page/overflow failures plus `execution=mock/skipInfra/skipDaemon`, dark mode now remaps semantic tokens in one layer, and MCP tool execution now exposes a human-confirm affordance from the shared playground view-model. | Run the hydrated QA gate against the full Docker-backed daemon/gateway stack, keep regular live Electron shell capture, and continue density/polish passes across long MCP schemas and artifact previews. |
| Hardcoding, harness, SDK/API | 88% | Runtime env, artifact policy, daemon config, CLI config loading, typed CLI runtime script registry, MCP discovery/call results, daemon memory config construction, structured memory profile contracts, runtime ack parsing, topology-to-kernel lane compilation, role-derived subagent routing, manifest topology contracts, concrete agent-runtime child dependency forks, first-class delegate metadata, profile-projected MCP/memory/deep-research startup fragments, profile-selected MCP OTel dependency planning, SDK/OTLP factory contracts, daemon-hosted OTel SDK factory injection, focused provider/home-screen TUI render/input harnesses, typed memory reflect event contracts, retain/reflect runtime events, profile-first CLI MCP config resolution, PEP execution context, browser-safe topology/MCP/navigation/detail selectors, MCP gateway alias catalogs, profile-owned deep-research live adapter suites, Python and TypeScript provider catalog sharing, shared model metadata catalog sharing, launcher executor tests, shared selected-profile lookup, durable smoke evidence files, profile-owned fast and full-lifecycle integration gates, execution-aware hydrated visual QA evidence, the adapter-injected runtime integration gate, and the profile-owned runtime-daemon composition smoke are being centralized through resolver/contract-backed APIs. | Replace remaining switch-heavy routing where it blocks extensibility, harden remaining live harnesses, and deduplicate remaining runtime-profile/daemon manifest topology projection. |
| Docker/local ecosystem | 84% | `configs/runtime/profiles.json`, workbench launcher, resolved runtime state, daemon resolved-config startup, memory-stack profile projection, shared runtime topology projection, profile-generated MCP config fragments, profile-projected deep-research MCP targets, daemon plan-context topology injection, profile-driven topology doctor checks, mock/web/desktop topology consumption, profile-driven Electron shell startup, surface-aware `waitFor` gates, smoke readiness plans filtered from the selected profile checks, compose startup args reused from readiness projection, profile-selected daemon MCP OTel recorder planning, daemon-hosted OTLP HTTP/JSON exporter injection, profile-gated retain/reflect enablement, profile-first CLI MCP reads, opt-in `workbench-host` web/desktop live smoke commands, renderer-only hydrated visual QA, an explicit `test-host` memory persistence gate, a profile-owned fast aggregate runtime integration gate, a separate full-lifecycle gate with Docker CLI plus daemon preflight artifact, a profile-owned single-run daemon composition smoke, isolated test Compose project names, and durable live memory evidence now exist. | Run live Docker/local web plus Electron smoke and hydrated QA gates in a slower environment with Docker Desktop available, and reduce remaining compose/profile drift risks with explicit config parity checks. |

Behavior-level evidence for the ten file-level drift rows now lives in
`docs/upgrade/eam-behavior-parity.md` and the script-consumed
`docs/upgrade/eam-behavior-parity.json`. The current classification is ten
intentional Kirakira extension rows: ten covered and zero unclassified EAM
behavior gaps. Product-level extension packages still carry their own roadmap
status so the high structural score is not confused with final completion.

## Gap Matrix

| Area | EAM source | Kirakira current | Status | Next implementation slice |
| --- | --- | --- | --- | --- |
| Subagent swarm topology | `reference_project/eam-agent/packages/orchestrator-kernel/src/subagent/*` | `packages/orchestrator-kernel/src/subagent/*`, `packages/runtime-daemon/src/bridge/kernel-bridge.ts`, `configs/runtime/profiles.json`, `packages/config-resolver/src/resolved-state.ts`, `packages/runtime-daemon/src/bin/daemon-config.ts`, `packages/runtime-contracts/src/status.ts`, `scripts/runtime-doctor.mjs` | Covered for current parity. Contracts, inheritance, delegate bridge, kernel events, public topology schema, resolved profile topology projection, runtime-profile launcher topology merge, topology lane compilation, role-aware contract/routing/event projection, role defaults, deterministic lineage IDs, handoff edge IDs, permission metadata, first-class agent-runtime delegate request fields, public topology manifest, profile doctor topology check, PEP/audit execution context, JSON Track A source/intent/gate/test evidence, and single-run runtime-daemon composition smoke evidence exist. | Keep topology assertions in the composition gate as roles and handoff modes evolve. |
| Deep research | `reference_project/eam-agent/packages/memory-service/src/recall/*`, `packages/memory-pipeline/*`, `packages/orchestrator-kernel/src/research/*` | `packages/deep-research`, `packages/orchestrator-kernel/src/research/*`, `packages/runtime-daemon/src/bridge/deep-research.ts`, `packages/runtime-daemon/src/bridge/memory-runtime-deps.ts`, `configs/runtime/profiles.json`, structured memory runtime profile state | Covered for current parity. Kernel research executor, daemon composition, lazy default daemon memory recall source, profile-projected memory defaults, profile-projected MCP research target discovery, profile-gated retain/reflect daemon memory bridge contracts, typed reflect runtime events, MCP tool-originated `isError` evidence, MCP transport failure propagation, profile-owned live adapter suite/test/check metadata, live KernelBridge stdio/http MCP research event coverage, composition-smoke assertions for memory plus stdio/http MCP citations/evidence, aggregate runtime integration gate evidence, JSON Track A source/intent/gate/test evidence, and single-run composition smoke evidence exist. | Keep profile-owned suite/test/check metadata current as adapters grow, and keep multi-source failure/fanout assertions in the non-Docker composition gate. |
| MCP design | `reference_project/eam-agent/packages/mcp-adapter/src/*`, `docs/plane/eam-agent-cli/07-mcp/*` | `packages/mcp-adapter`, `configs/runtime/profiles.json`, `scripts/runtime-profile.mjs`, `packages/cli/src/runtime/runtime-mcp-config.ts`, `packages/runtime-daemon/src/bridge/mcp-runtime-deps.ts`, `packages/runtime-daemon/src/bridge/runtime-deps.ts`, `packages/runtime-daemon/src/bridge/mcp-runtime.ts`, runtime MCP manifest plus `mcp_call` and `mcp_list` projection, `packages/frontend-core/src/mcp-directory.ts`, shared workbench MCP panel | Covered for current parity. Catalog rendering, MCP manager registration, profile-rendered MCP alias catalogs, profile-first CLI MCP reads with local custom-server overlay, public daemon manifest projection, shared browser/desktop MCP tool invocation, live MCP discovery contracts, direct call run events, delegate/direct daemon MCP dependency construction, delegated ToolExecutor gateway closure, live workbench health/discovery view, direct-call gateway trust/audit context, policy/trust-enriched discovery metadata, injectable MCP OTel span recording, profile/env-selected MCP OTel recorder plans, daemon-hosted OTLP HTTP/JSON SDK export, SDK/OTLP factory planning, and live stdio/HTTP propagation smoke coverage now share typed dependency contracts. File-level parity still flags `mcp-adapter` extras for alias catalog, gateway context, OTel bridge, and OTel profile planning, which are real Kirakira extension surfaces rather than EAM namespace drift. | Keep live smoke in the MCP release gate as new transports are added. |
| Memory | `reference_project/eam-agent/packages/memory-core`, `memory-service`, `memory-store`, `memory-vector`, `memory-graph`, `memory-pipeline` | Same renamed packages exist under `packages/`; docs under `docs/plane/kirakira-agent-memory`; daemon memory dependency factory builds lazy recall sources, retain/reflect bridges, and memory-backed checkpoint repositories from structured runtime profile state plus env. | Covered for current parity. Package surface, pipeline env bridge, default daemon recall composition, resolved memory profile contracts, profile-selected daemon checkpoint repository, profile-gated retain/reflect enablement, retain runtime events, reflect runtime events, reflect service-outbox contract exposure, isolated `test-host` Compose project ownership, and live checkpoint/retain/reflect persistence evidence now exist. Rename-aware file parity treats `eam_memory_pipeline` -> `kirakira_memory_pipeline` as equivalent and filters generated Python cache artifacts. The checkpoint migration/repository surface in `memory-store` is now validated by `docs/upgrade/gates/memory-persistence-smoke.json`. | Keep the live memory gate in release checks as memory backends evolve. |
| Policy and harness | `reference_project/eam-agent/packages/policy-engine`, `packages/eamd`, `policies/*` | `packages/policy-engine`, `packages/kirakirad`, `policies/*`, `packages/runtime-daemon/src/bridge/mcp-runtime.ts`, `packages/runtime-daemon/src/bridge/runtime-deps.ts` | Advancing. PEP/PDP packages exist; daemon direct MCP calls and delegated subagent ToolExecutor paths now pass role/lane execution context into PEP without using topology roles as principal roles, and delegated tool calls now route through the same daemon MCP gateway surface. | Ensure web/desktop/direct/delegated tool actions share the same profile-selected OTel/audit context; reduce remaining harness duplication. |
| Registry and skills | `reference_project/eam-agent/packages/registry-client`, `packages/skill-runtime` | `packages/registry-client`, `packages/skill-runtime`, `kirakira.lock` schema, local generated `skills-lock.json` ignored | Advancing. Packages exist; tracked lockfile policy is now explicit: `skills-lock.json` is local generated state and auditable installs use `kirakira.lock`. | Connect registry trust decisions to runtime install/activation UI and CLI. |
| Audit and tracing | `reference_project/eam-agent/packages/audit-ledger`, `docs/plane/eam-agent-tracing` | `packages/audit-ledger`, `docs/plane/kirakira-agent-tracing`, policy-engine ledger writer execution context | Advancing. Ledger package and tracing plane exist; policy decision/tool execution audit rows now preserve subagent role/lane execution context. Rename-aware file parity now treats the tracing doc filename token rename `eam-` -> `kirakira-` as equivalent, so no tracing docs file drift remains. | Emit OTel-compatible spans for run, tool, MCP, subagent, research, memory retrieval, and policy decisions. |
| Runtime profiles | `reference_project/eam-agent/packages/config-resolver`, `agent.toml`, `policy.yaml` | `configs/runtime/profiles.json`, `packages/config-resolver`, `scripts/runtime-profile.mjs`, daemon resolved-config startup, CLI resolver adapter, `scripts/runtime-integration-gate.mjs`, `scripts/runtime-daemon-composition-smoke.mjs` | Advancing. Daemon and CLI now consume resolved config, profile projection can emit MCP config plus memory-stack startup fragments without writing local `.mcp.json`, read-only CLI MCP commands now resolve the profile projection before local compatibility overlays, `integrationGates.upgrade` gives release checks a profile-owned aggregate gate, and `daemonCompositionGates.runtime-daemon:composition-smoke` proves profile-derived topology/deep-research contracts in one KernelBridge run. | Move remaining CLI config subcommands and init/doctor surfaces away from local helper duplication, project integration-gate fragments through the resolver, then wire projection fragments into launchers where behavior permits. |
| Runtime protocol | `reference_project/eam-agent/packages/runtime-contracts`, daemon/browser/desktop clients | `packages/runtime-contracts`, daemon/browser/desktop clients, runtime manifest MCP projection | Advancing. Ack payload parsing, public MCP runtime directory, MCP tool invocation results, MCP discovery results, and desktop preload validation are centralized in runtime contracts. | Extend the same contract layer to richer gateway/audit/tracing results and live workbench projections. |
| Presentation shell | `reference_project/openhuman/app`, `reference_project/openhuman/src`, `reference_project/openhuman/design-previews` | `apps/web`, `apps/desktop`, `packages/frontend-app`, `packages/frontend-core`, `DESIGN.md` | Advancing. Shared workbench now has manifest-aware swarm topology, MCP directory panels, tested navigation view models, active Runs/Agents/Research/Systems workspace surfaces, selected subagent drawers, citation ledgers, artifact detail cards, visual-QA hooks backed by frontend-core projections, an offline SSR render evidence gate for both Web and Desktop surfaces, and a profile-owned hydrated screenshot QA gate with web/desktop, mobile/tablet/desktop, console/pageerror, overflow, and nonblank evidence. | Run the hydrated gate against the full daemon/gateway stack and continue density/polish passes for long schemas and artifact previews. |

## Agent Audit Intake

Latest four-lane audit intake on 2026-06-09:

- **EAM mechanisms:** packages are mostly present; the missing layer was a
  declarative topology projection plus a profile-driven runtime dependency
  factory that composes MCP, PDP, audit, memory, subagent, and deep-research
  dependencies for daemon, CLI, web, and desktop paths. Runtime topology now
  has public schema, resolved profile projection, launcher merge, daemon
  lane-capacity compilation, role-aware contract normalization, role-derived
  lane routing, role/requested-lane event projection, deterministic lineage
  IDs, handoff edge IDs, role defaults, sanitized manifest topology projection,
  profile doctor topology validation, first-class delegate request metadata,
  and PEP/audit execution context. Remaining work is gateway OTel/audit
  convergence and broader live daemon source-adapter validation.
- **2026-06-09 EAM parity audit normalization:** `scripts/eam-parity-audit.mjs`
  now compares source file paths after scoped namespace normalization rather
  than raw product-token paths. It treats `eamd` -> `kirakirad`,
  `eam_memory_pipeline` -> `kirakira_memory_pipeline`,
  `eam_model_gateway` -> `kirakira_model_gateway`, and tracing doc
  `eam-` -> `kirakira-` filename prefixes as equivalent where the owning
  package/docs plane matches. Generated Python cache files are ignored. The
  file-level audit dropped from `drift=11` to `drift=8`; after the 2026-06-10
  core provider catalog, Python model-gateway provider catalog, and runtime
  ready plan slices, current file-level drift is `drift=10` and all ten rows
  are classified in the behavior matrix.
- **Presentation:** shells and gateway are usable, and the shared workbench now
  has first-class views for topology, MCP directory, citation ledgers, artifact
  detail cards, and visual-QA hooks. The next UI slice should continue
  density/polish passes across long MCP schemas, tool timeline entries,
  citation chips, and artifact previews.
- **2026-06-09 topology UI slice:** four-agent audit confirmed the next
  presentation step should replace the flat subagent list with a shared
  topology projection. `packages/frontend-core/src/topology.ts` now merges
  public orchestration manifest roles/lanes/handoffs with graph subagent nodes
  and runtime subagent events. `packages/frontend-app/src/workbench.tsx` now
  consumes that selector for Web and Electron renderer, and
  `packages/frontend-app/src/mock-transport.ts` publishes a mock topology
  manifest so local preview uses the same contract. Remaining risks from the
  audit: unknown event-supplied roles still need explicit warnings, and topology
  manifest projection is still split across runtime-profile and daemon
  lifecycle helpers.
- **2026-06-09 Electron launch slice:** `pnpm start:desktop` now resolves the
  `workbench-host` profile into daemon background, desktop renderer background,
  and Electron shell foreground steps. The Electron main/preload security model
  remains aligned with Electron's official guidance: context isolation, renderer
  sandboxing, no Node integration in the renderer, and explicit sender-origin
  checks for IPC. The Electron shell also supports a hidden smoke mode that
  exits after renderer `did-finish-load` and fails non-zero on load failure or
  timeout. Remaining risk: live Docker/daemon readiness still needs regular
  execution in a slower end-to-end gate outside focused unit tests.
- **2026-06-09 workbench readiness supervisor slice:** `workbench-host`
  surface steps now declare `waitFor` readiness checks consumed by
  `scripts/kirakira-workbench.mjs`. Web waits for the browser gateway before
  opening Vite. Desktop waits for daemon IPC and browser gateway when the
  launcher owns the daemon, and always waits for the desktop renderer before
  opening Electron. The local supervisor now fails fast if background daemon or
  renderer children exit while a readiness wait or foreground web/Electron
  process is active, and cleanup uses process-tree termination on Windows plus
  bounded TERM/KILL semantics elsewhere. Remaining risk is live smoke coverage
  against actual Docker services and Electron windows.
- **2026-06-09 runtime profile projection slice:** `scripts/runtime-profile.mjs`
  now exposes a `projection` action that emits profile-derived MCP config and
  memory-stack startup fragments without reading or writing local `.mcp.json`.
  `packages/config-resolver` exposes the same resolved-state projection shape
  for downstream daemon, launcher, and harness consumers. Read-only CLI MCP
  commands now resolve the profile projection first and overlay non-conflicting
  local custom servers. Remaining risk is replacing older callers that still
  assemble memory-stack or topology details locally.
- **2026-06-09 MCP directory UI slice:** the shared web/Electron workbench now
  exposes live MCP discovery through `runtime.listMcpTools()`, using
  `packages/frontend-core/src/mcp-directory.ts` for health, tool count, and
  schema view-models. Mock preview covers healthy, degraded, and stopped MCP
  servers, and a headless Chrome visual check verified the `5183` web surface.
  The direct daemon MCP path now builds gateway trust/policy/audit/OTel context
  from registered server config instead of hardcoded server names, propagates
  trust tier into PEP, records direct-call audit bridge rows, and enriches
  `mcp_list` discovery results with typed server/tool metadata. Remaining
  parity risk is actual OTel span emission and richer workbench execution UI.
- **2026-06-09 MCP argument playground slice:** the shared workbench now derives
  editable JSON argument drafts, field summaries, and trust/policy/audit rows
  from the typed `mcp_list` discovery metadata. The execute affordance calls
  `runtime.callMcpTool()` with the selected server/tool and parsed arguments,
  preserving the daemon/gateway PEP and audit path and avoiding hardcoded
  server names, paths, or workbench endpoints. Remaining UI risk is visual
  density in the narrow right rail when a tool publishes large schemas or long
  policy reason lists.
- **2026-06-09 MCP OTel bridge slice:** direct daemon `mcp_list` and
  `mcp_call` now create injectable MCP client spans from the shared gateway
  metadata, expose span id/status/duration through runtime contracts, and
  propagate W3C `traceparent` through MCP `params._meta` when a recorder is
  supplied. Tests use an in-memory exporter; the adapter can now select an
  explicit OpenTelemetry SDK/OTLP factory mode without pretending export exists,
  and runtime-daemon now injects a concrete OTLP HTTP/JSON SDK factory when a
  selected profile requires SDK-owned export.
- **2026-06-09 workbench live smoke gate slice:** `pnpm e2e:workbench` now
  wraps the profile-driven workbench launcher in an opt-in smoke harness. The
  default path reports the resolved plan without starting services; live mode
  requires `KIRAKIRA_LIVE_E2E=1` or `--live`, starts the selected
  `workbench-host` surface, waits for profile-rendered readiness checks, and
  tears down foreground workbench processes after readiness passes. Desktop live
  smoke now gets its hidden foreground Electron assertion from the launcher
  smoke contract, the same contract emitted by dry-run plans, and reuses
  `presentation:desktop` plus daemon readiness from the profile. Remaining risk
  is running the live gates regularly against Docker/daemon/web/desktop.
- **Runtime ecosystem:** `test/helpers/memory-env.ts` now derives the
  `test-host` memory stack fallback values from runtime profiles instead of
  local literals, and the workbench smoke gate now uses resolved
  `workbench-host` readiness names plus launcher-owned smoke step overrides
  instead of local presentation-port literals or wrapper-only desktop branching.
  The dry-run smoke report now exposes explicit profile-derived targets for
  web `5183`, desktop renderer `5174`, and gateway `17373`.
  `integrationGates.upgrade` now aggregates deep-research, memory-persistence,
  runtime-daemon composition, workbench smoke, and renderer-only hydrated visual
  QA child gate evidence into `docs/upgrade/gates/runtime-integration-gate.json`.
  `integrationGates.full-lifecycle` and
  `runtimeLifecycleGates.runtime-full-lifecycle` define the slower no-skip
  Docker-backed chain. The current lifecycle artifact is blocked at `docker
  info` because Docker Desktop is not available; remaining work is running the
  full chain in that environment and reducing Compose/profile drift.
- **Architecture/API:** the largest hardcoding seam is no longer package
  presence, but split ownership of config, protocol parsing, harness readiness,
  and presentation endpoints. CLI config loading is now routed through
  `@kirakira/config-resolver`; runtime control ack/result parsing now lives in
  `@kirakira/runtime-contracts`. Runtime manifests now expose the resolved MCP
  directory without secrets, `mcp_call` carries browser/desktop MCP tool
  invocation through daemon-side PEP and typed ack results, and `mcp_list`
  carries live MCP discovery/health through daemon, browser, desktop, and mock
  transports. Direct `mcp_call` requests with a `runId` now emit run timeline
  events. Delegate runtime and direct daemon MCP calls share one MCP dependency
  factory backed by resolved runtime profiles. Daemon memory now has a lazy
  runtime dependency factory that can inject a default memory recall source into
  deep research and select a memory-backed checkpoint repository from
  structured runtime memory profile state plus env. Subagent
  role/lane selection now comes from resolved topology contracts and rejects raw
  lane hints once a role catalog exists. Public runtime manifests now expose a
  sanitized topology summary, runtime doctor validates role/lane/handoff shape,
  daemon MCP PEP/audit paths receive `context.execution` role metadata, and
  direct daemon MCP discovery/calls carry shared gateway trust/policy/audit/OTel
  metadata. Legacy gateway aliases now have an injectable catalog with profile
  rendering from `configs/runtime/profiles.json`, and read-only CLI MCP commands
  consume that profile-projected config before local overlays. Web/Electron now
  expose a shared MCP argument playground backed by discovery metadata. Delegate
  lineage, topology, and permission metadata are now first-class agent-runtime
  request fields; daemon MCP dependencies now select the profile-driven OTel
  recorder; OTel SDK/OTLP mode has an explicit factory boundary plus a daemon
  OTLP HTTP/JSON host implementation instead of a fake exporter; daemon memory
  dependencies now emit typed retain/reflect runtime events, and the memory
  persistence gate now has isolated live Docker evidence. Deep-research live
  adapter suites, checks, unit tests, live tests, and references now live in
  `deepResearchLiveAdapterGates`, and the aggregate runtime integration gate
  uses adapter injection plus profile data instead of a switch over child gates.
  Next work should target topology source-adapter validation, telemetry
  propagation smoke coverage, and per-service readiness.

## Execution Queue

1. **Runtime deps factory:** create one profile-driven factory for MCP, PDP,
   audit, memory, subagent, and deep-research runtime dependencies.
   MCP/PDP/audit construction is now shared for delegate and direct daemon MCP
   paths; memory recall construction now joins daemon deep-research through a
   lazy profile/env-driven factory, daemon checkpoints can use a
   profile-selected memory-store Postgres envelope repository, and
   retain/reflect service bridge contracts plus typed runtime events are now
   wired. Live checkpoint plus retain/reflect persistence is covered by the
   isolated `test-host` gate; remaining work is OTel/audit convergence.
2. **MCP runtime loop:** expose daemon MCP tools/health through
   `RuntimeManifest`, browser gateway, and desktop IPC.
  Tool invocation, typed live discovery, direct call run-event emission, and
  health/discovery UI are now wired. Direct calls now share gateway
  trust/audit context and discovery results include typed policy/trust/audit
  metadata plus an injectable OTel-compatible span recorder/export bridge; the
  shared workbench argument playground is now wired. The daemon dependency path
  now selects profile/env-driven recorder plans, and the adapter can select an
  explicit OpenTelemetry SDK/OTLP factory mode without pretending export exists.
  Runtime-daemon now provides the concrete OTLP HTTP/JSON host factory; live
  propagation gates remain.
3. **Memory daemon composition:** construct memory service dependencies from
   resolved runtime profile env and inject memory recall into deep research by
   default.
   Lazy daemon recall injection, structured memory profile projection,
   profile-selected memory checkpoint repository injection, profile-gated
   retain/reflect memory service bridges, typed reflect runtime events, and
   isolated Docker/local live checkpoint plus retain/reflect persistence
   evidence are now wired.
4. **Swarm topology projection:** add resolved orchestration topology fields
   and compile them into kernel lane capacities, child runtime policy, and
   lineage events.
   Public schema, runtime profile topology projection, runtime-profile launcher
   merge, daemon lane-capacity compilation, role-aware contract normalization,
   role-derived `LaneRouter` behavior, delegate request metadata, and
   event-store/frontend role projection are now wired. Public topology manifest,
   runtime doctor topology validation, role defaults, deterministic lineage IDs,
   handoff edge IDs, first-class agent-runtime delegate metadata fields, and
   PEP/audit execution context are now wired. Remaining work: live daemon
   source-adapter validation and gateway/OTel audit events.
5. **Workbench IA pass:** split `packages/frontend-app/src/workbench.tsx` into
   durable views: runs, agents, research, systems, approvals, artifacts, and
   settings. Topology, MCP directory, navigation, selected-subagent drawer,
   citation ledger, artifact detail cards, and visual-QA hooks are now wired
  through frontend-core. Renderer-level hydrated screenshot QA is now archived
  for web/desktop and mobile/tablet/desktop with explicit mock/skip execution
  identity. Remaining work is full-stack live visual QA and density polish.
6. **Electron full launch:** `start:desktop` now runs daemon plus renderer plus
   Electron main with profile-driven readiness gates. Hidden non-interactive
   Electron smoke validation is now wired through the workbench live gate;
   remaining work is regular live execution and broader desktop IA polish.
7. **Workbench launcher supervisor:** declarative `waitFor` gates, readiness
   plan filtering, background fail-fast racing, process-tree cleanup, and an
   opt-in `pnpm e2e:workbench` live smoke wrapper are now wired. The hydrated
   QA gate reuses the same supervisor via an `afterReady` hook. Remaining work
   is regular live execution against Docker/daemon/web/desktop.
8. **Runtime integration gate:** `pnpm integration:gate` now aggregates
   profile-owned deep-research, memory, runtime-daemon composition, and
   workbench plus renderer-level hydrated visual QA evidence without starting
   live services by default. The single-run composition smoke now proves the
   same mechanisms compose inside one `KernelBridge` execution, and the
   presentation gate now proves hydrated renderer screenshots with execution
   identity. The separate `runtime-full-lifecycle` gate now records Docker
   preflight failure instead of silently passing; remaining work is full
   Docker-backed web/Electron smoke execution in a Docker Desktop environment.

## Validation Gates

- Every parity-audit change must run the focused test and the actual reference
  comparison:
  `pnpm exec vitest run test/unit/eam-parity/eam-parity-audit.test.ts`,
  `pnpm parity:eam -- --format json`, and
  `pnpm parity:eam -- --depth files --format json`.
- Every runtime/profile change must run the profile contract tests and assert no
  accidental `5173` dependency:
  `test/unit/runtime/profile-resolution.test.ts`,
  `test/unit/scripts/workbench-launcher.test.ts`,
  `test/unit/scripts/workbench-smoke.test.ts`, and relevant daemon tests.
- Live workbench startup validation is opt-in and bounded:
  `pnpm e2e:workbench -- --profile workbench-host --surface web --timeout-ms 120000 --live`.
  Desktop uses the same profile/readiness path with a hidden Electron smoke:
  `pnpm e2e:workbench -- --profile workbench-host --surface desktop --timeout-ms 120000 --live`.
- Every daemon/kernel change must run the package typecheck and focused daemon
  tests before commit.
- Every web/desktop visual change must run the profile-owned hydrated visual
  QA gate or an equivalent stricter browser/Electron gate:
  `$env:VITE_KIRAKIRA_RUNTIME_MODE='mock'; node scripts/presentation-hydrated-visual-qa.mjs --gate presentation-hydrated-visual-qa --profile workbench-host --live --timeout-ms 240000 --skip-infra --skip-daemon`.
  Full-stack visual validation should rerun without `--skip-infra --skip-daemon`
  when Docker Desktop and the daemon stack are available.
- Every ecosystem/lifecycle change must run or dry-run the full lifecycle gate:
  `node scripts/runtime-full-lifecycle-gate.mjs --gate runtime-full-lifecycle --profile workbench-host --live --timeout-ms 240000`.
  When Docker Desktop is unavailable, the expected artifact status is
  `blocked` with `preflight.status=failed`; it must not be treated as a pass.
- Every ecosystem change must end with `git push`, `git ls-remote`, and a final
  worktree status check.
