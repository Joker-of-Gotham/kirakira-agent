# EAM Parity Upgrade Roadmap

Date: 2026-06-09

This roadmap is the control surface for the four-track upgrade request. It is
not a substitute for implementation; every row must eventually point to a code
change, a validation command, and a pushed commit.

## Authoritative References

- MCP lifecycle and capability negotiation:
  https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle
- Docker Compose environment variables and precedence:
  https://docs.docker.com/compose/environment-variables/
  https://docs.docker.com/compose/how-tos/environment-variables/set-environment-variables/
- Electron context isolation and security:
  https://www.electronjs.org/docs/latest/tutorial/context-isolation
  https://www.electronjs.org/docs/latest/tutorial/security
- LangGraph multi-agent and handoff patterns:
  https://langchain-ai.github.io/langgraph/tutorials/multi_agent/multi-agent-collaboration/
  https://docs.langchain.com/oss/javascript/langchain/multi-agent/handoffs
- OpenAI Agents SDK handoffs and guardrails:
  https://openai.github.io/openai-agents-js/guides/handoffs/
  https://openai.github.io/openai-agents-js/guides/guardrails/
- OpenTelemetry GenAI agent semantic conventions:
  https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-agent-spans/
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
| EAM mechanism parity | 41% | EAM-like packages exist in `packages/*`; subagent, deep research, MCP, memory, policy, registry, and audit packages are present; MCP invocation, live discovery contracts, direct call event projection, and daemon default memory recall construction now exist. | Prove exact parity against `reference_project/eam-agent`; project structured memory runtime state from profiles; finish MCP gateway/trust/audit closure; finish swarm topology/config. |
| Web and Electron presentation | 45% | `apps/web`, `apps/desktop`, `packages/frontend-app`, and `packages/frontend-core` exist; workbench uses runtime gateway contracts. | Full Electron app launch, richer multi-view workbench, OpenHuman-informed visual system, design tokens, browser/desktop visual QA. |
| Hardcoding, harness, SDK/API | 36% | Runtime env, artifact policy, daemon config, CLI config loading, MCP discovery/call results, daemon memory config construction, and runtime ack parsing are being centralized through resolver/contract-backed APIs. | Replace switch-heavy routing where it blocks extensibility, harden test harnesses, finish policy context unification. |
| Docker/local ecosystem | 40% | `configs/runtime/profiles.json`, workbench launcher, resolved runtime state, and daemon resolved-config startup exist. | Make profile state the only startup truth source, unify memory stack readiness, generate MCP config from profiles, verify Docker/local/desktop/web paths end-to-end. |

## Gap Matrix

| Area | EAM source | Kirakira current | Status | Next implementation slice |
| --- | --- | --- | --- | --- |
| Subagent swarm topology | `reference_project/eam-agent/packages/orchestrator-kernel/src/subagent/*` | `packages/orchestrator-kernel/src/subagent/*`, `packages/runtime-daemon/src/bridge/kernel-bridge.ts` | Partial. Contracts, inheritance, delegate bridge, and kernel events exist. | Add a declarative swarm/topology projection from resolved config into kernel routing and delegation policy; validate multi-subagent fanout and lineage. |
| Deep research | `reference_project/eam-agent/packages/memory-service/src/recall/*`, `packages/memory-pipeline/*`, `packages/orchestrator-kernel/src/research/*` | `packages/deep-research`, `packages/orchestrator-kernel/src/research/*`, `packages/runtime-daemon/src/bridge/deep-research.ts`, `packages/runtime-daemon/src/bridge/memory-runtime-deps.ts` | Advancing. Kernel research executor, daemon composition, and lazy default daemon memory recall source exist. | Project structured memory profile state, add gated Docker/local daemon integration coverage, and connect retain/reflect/checkpoint events. |
| MCP design | `reference_project/eam-agent/packages/mcp-adapter/src/*`, `docs/plane/eam-agent-cli/07-mcp/*` | `packages/mcp-adapter`, `configs/runtime/profiles.json`, `scripts/runtime-profile.mjs`, `packages/runtime-daemon/src/bridge/mcp-runtime-deps.ts`, `packages/runtime-daemon/src/bridge/runtime-deps.ts`, `packages/runtime-daemon/src/bridge/mcp-runtime.ts`, runtime MCP manifest plus `mcp_call` and `mcp_list` projection | Advancing. Catalog rendering, MCP manager registration, public daemon manifest projection, shared browser/desktop MCP tool invocation, live MCP discovery contracts, direct call run events, and delegate/direct daemon MCP dependency construction now share one factory. | Expose live tool health/discovery views in the workbench, route direct calls through gateway trust/audit/OTel, and replace remaining CLI MCP setup duplication where CLI behavior permits. |
| Memory | `reference_project/eam-agent/packages/memory-core`, `memory-service`, `memory-store`, `memory-vector`, `memory-graph`, `memory-pipeline` | Same renamed packages exist under `packages/`; docs under `docs/plane/kirakira-agent-memory`; daemon memory dependency factory now builds lazy recall sources from runtime env. | Advancing. Package surface, pipeline env bridge, and default daemon recall composition exist. | Promote memory config into resolved runtime profile state, reuse the builder from harnesses, and connect retain/reflect/checkpoint to runs. |
| Policy and harness | `reference_project/eam-agent/packages/policy-engine`, `packages/eamd`, `policies/*` | `packages/policy-engine`, `packages/kirakirad`, `policies/*` | Partial. PEP/PDP packages exist. | Centralize runtime policy context generation and ensure web/desktop tool actions pass through same PEP path as CLI. |
| Registry and skills | `reference_project/eam-agent/packages/registry-client`, `packages/skill-runtime` | `packages/registry-client`, `packages/skill-runtime`, `skills-lock.json` | Partial. Packages exist; lockfile is currently untracked local state. | Decide tracked vs generated lockfile policy; connect registry trust decisions to runtime install/activation UI and CLI. |
| Audit and tracing | `reference_project/eam-agent/packages/audit-ledger`, `docs/plane/eam-agent-tracing` | `packages/audit-ledger`, `docs/plane/kirakira-agent-tracing` | Partial. Ledger package and tracing plane exist. | Emit OTel-compatible spans for run, tool, MCP, subagent, research, memory retrieval, and policy decisions. |
| Runtime profiles | `reference_project/eam-agent/packages/config-resolver`, `agent.toml`, `policy.yaml` | `configs/runtime/profiles.json`, `packages/config-resolver`, `scripts/runtime-profile.mjs`, daemon resolved-config startup, CLI resolver adapter | Advancing. Daemon and CLI now consume resolved config. | Move remaining CLI config subcommands and init/doctor surfaces away from local helper duplication. |
| Runtime protocol | `reference_project/eam-agent/packages/runtime-contracts`, daemon/browser/desktop clients | `packages/runtime-contracts`, daemon/browser/desktop clients, runtime manifest MCP projection | Advancing. Ack payload parsing, public MCP runtime directory, MCP tool invocation results, MCP discovery results, and desktop preload validation are centralized in runtime contracts. | Extend the same contract layer to richer gateway/audit/tracing results and live workbench projections. |
| Presentation shell | `reference_project/openhuman/app`, `reference_project/openhuman/src`, `reference_project/openhuman/design-previews` | `apps/web`, `apps/desktop`, `packages/frontend-app`, `packages/frontend-core` | Partial. Shared workbench exists but is still a narrow runtime console. | Build product-grade navigation, inspector, research, memory, MCP, and settings views with design tokens and visual QA. |

## Agent Audit Intake

Latest four-lane audit intake on 2026-06-09:

- **EAM mechanisms:** packages are mostly present; the missing layer is a
  profile-driven runtime dependency factory that composes MCP, PDP, audit,
  memory, subagent, and deep-research dependencies for daemon, CLI, web, and
  desktop paths.
- **Presentation:** shells and gateway are usable, but `workbench.tsx` and
  `styles.css` are too large and event-log oriented. The next UI slice should
  model OpenHuman-style tool timeline entries, citation chips, and artifact
  cards as first-class dashboard data.
- **Runtime ecosystem:** `test/helpers/memory-env.ts` now derives the
  `test-host` memory stack fallback values from runtime profiles instead of
  local literals. Remaining work is direct daemon startup coverage and Compose
  duplication reduction.
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
  deep research from runtime env. Next work should target live MCP workbench
  views, gateway trust/audit/OTel convergence, structured memory profile state,
  and per-service test readiness.

## Execution Queue

1. **Runtime deps factory:** create one profile-driven factory for MCP, PDP,
   audit, memory, subagent, and deep-research runtime dependencies.
   MCP/PDP/audit construction is now shared for delegate and direct daemon MCP
   paths; memory recall construction now joins daemon deep-research through a
   lazy env-driven factory. Remaining work is structured profile memory state,
   retain/reflect/checkpoint wiring, and OTel/audit convergence.
2. **MCP runtime loop:** expose daemon MCP tools/health through
   `RuntimeManifest`, browser gateway, and desktop IPC.
   Tool invocation, typed live discovery, and direct call run-event emission
   are now wired; health/discovery UI and gateway trust/audit/OTel convergence
   remain.
3. **Memory daemon composition:** construct memory service dependencies from
   resolved runtime profile env and inject memory recall into deep research by
   default.
   Lazy daemon recall injection is now wired and unit-tested; profile projection
   and gated Docker/local integration remain.
4. **Swarm topology projection:** add resolved orchestration topology fields
   and compile them into kernel lane capacities, child runtime policy, and
   lineage events.
5. **Workbench IA pass:** split `packages/frontend-app/src/workbench.tsx` into
   durable views: runs, graph, research, memory, MCP, approvals, artifacts,
   settings. First data-model slice: tool timeline entries, citation ledger,
   and artifact cards.
6. **Electron full launch:** make `start:desktop` run daemon plus renderer plus
   Electron main, with context-isolated preload and smoke validation.

## Validation Gates

- Every runtime/profile change must run the profile contract tests and assert no
  accidental `5173` dependency:
  `test/unit/runtime/profile-resolution.test.ts`,
  `test/unit/scripts/workbench-launcher.test.ts`, and relevant daemon tests.
- Every daemon/kernel change must run the package typecheck and focused daemon
  tests before commit.
- Every web/desktop visual change must be checked in the in-app browser or
  Playwright at web `5183`, desktop renderer `5174`, and gateway `17373`.
- Every ecosystem change must end with `git push`, `git ls-remote`, and a final
  worktree status check.
