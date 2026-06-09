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
| EAM mechanism parity | 50% | EAM-like packages exist in `packages/*`; subagent, deep research, MCP, memory, policy, registry, and audit packages are present; MCP invocation, live discovery contracts, direct call event projection, daemon default memory recall construction, structured memory runtime profile state, declarative swarm topology projection, role-aware subagent lane routing/events, public topology manifest projection, topology PEP/audit context, and frontend topology view-model now exist. | Prove exact parity against `reference_project/eam-agent`; finish MCP gateway/trust/audit/OTel closure; connect memory retain/reflect/checkpoint; add unknown-role topology warnings. |
| Web and Electron presentation | 52% | `apps/web`, `apps/desktop`, `packages/frontend-app`, and `packages/frontend-core` exist; workbench uses runtime gateway contracts, frontend-core preserves subagent role/requested-lane metadata, runtime manifests expose sanitized topology, the shared workbench renders a swarm topology panel, and `pnpm start:desktop` now plans daemon + renderer + Electron shell. | Richer multi-view workbench, OpenHuman-informed selected subagent activity, design-system docs, full Electron smoke automation, and broader visual QA. |
| Hardcoding, harness, SDK/API | 44% | Runtime env, artifact policy, daemon config, CLI config loading, MCP discovery/call results, daemon memory config construction, structured memory profile contracts, runtime ack parsing, topology-to-kernel lane compilation, role-derived subagent routing, manifest topology contracts, PEP execution context, and browser-safe topology selectors are being centralized through resolver/contract-backed APIs. | Replace switch-heavy routing where it blocks extensibility, harden test harnesses, finish shared gateway trust/audit/OTel context, and deduplicate runtime-profile/daemon manifest topology projection. |
| Docker/local ecosystem | 47% | `configs/runtime/profiles.json`, workbench launcher, resolved runtime state, daemon resolved-config startup, memory-stack profile projection, shared runtime topology projection, daemon plan-context topology injection, profile-driven topology doctor checks, mock/web/desktop topology consumption, and profile-driven Electron shell startup exist. | Reuse resolved memory/topology contracts in test harnesses, generate MCP config from profiles, and verify Docker/local/desktop/web paths end-to-end with live services. |

## Gap Matrix

| Area | EAM source | Kirakira current | Status | Next implementation slice |
| --- | --- | --- | --- | --- |
| Subagent swarm topology | `reference_project/eam-agent/packages/orchestrator-kernel/src/subagent/*` | `packages/orchestrator-kernel/src/subagent/*`, `packages/runtime-daemon/src/bridge/kernel-bridge.ts`, `configs/runtime/profiles.json`, `packages/config-resolver/src/resolved-state.ts`, `packages/runtime-daemon/src/bin/daemon-config.ts`, `packages/runtime-contracts/src/status.ts`, `scripts/runtime-doctor.mjs` | Advancing. Contracts, inheritance, delegate bridge, kernel events, public topology schema, resolved profile topology projection, runtime-profile launcher topology merge, topology lane compilation, role-aware contract/routing/event projection, public topology manifest, profile doctor topology check, and PEP/audit execution context exist. | Add role defaults for bounded model/context settings; add topology lineage IDs and shared gateway trust/audit/OTel context. |
| Deep research | `reference_project/eam-agent/packages/memory-service/src/recall/*`, `packages/memory-pipeline/*`, `packages/orchestrator-kernel/src/research/*` | `packages/deep-research`, `packages/orchestrator-kernel/src/research/*`, `packages/runtime-daemon/src/bridge/deep-research.ts`, `packages/runtime-daemon/src/bridge/memory-runtime-deps.ts`, structured memory runtime profile state | Advancing. Kernel research executor, daemon composition, lazy default daemon memory recall source, and profile-projected memory defaults exist. | Add gated Docker/local daemon integration coverage and connect retain/reflect/checkpoint events. |
| MCP design | `reference_project/eam-agent/packages/mcp-adapter/src/*`, `docs/plane/eam-agent-cli/07-mcp/*` | `packages/mcp-adapter`, `configs/runtime/profiles.json`, `scripts/runtime-profile.mjs`, `packages/runtime-daemon/src/bridge/mcp-runtime-deps.ts`, `packages/runtime-daemon/src/bridge/runtime-deps.ts`, `packages/runtime-daemon/src/bridge/mcp-runtime.ts`, runtime MCP manifest plus `mcp_call` and `mcp_list` projection | Advancing. Catalog rendering, MCP manager registration, public daemon manifest projection, shared browser/desktop MCP tool invocation, live MCP discovery contracts, direct call run events, and delegate/direct daemon MCP dependency construction now share one factory. | Expose live tool health/discovery views in the workbench, route direct calls through gateway trust/audit/OTel, and replace remaining CLI MCP setup duplication where CLI behavior permits. |
| Memory | `reference_project/eam-agent/packages/memory-core`, `memory-service`, `memory-store`, `memory-vector`, `memory-graph`, `memory-pipeline` | Same renamed packages exist under `packages/`; docs under `docs/plane/kirakira-agent-memory`; daemon memory dependency factory builds lazy recall sources from structured runtime profile state plus env. | Advancing. Package surface, pipeline env bridge, default daemon recall composition, and resolved memory profile contracts exist. | Reuse the contract from harnesses and connect retain/reflect/checkpoint to runs. |
| Policy and harness | `reference_project/eam-agent/packages/policy-engine`, `packages/eamd`, `policies/*` | `packages/policy-engine`, `packages/kirakirad`, `policies/*`, `packages/runtime-daemon/src/bridge/mcp-runtime.ts`, `packages/runtime-daemon/src/bridge/runtime-deps.ts` | Advancing. PEP/PDP packages exist; daemon direct MCP calls and delegated subagent ToolExecutor paths now pass role/lane execution context into PEP without using topology roles as principal roles. | Ensure web/desktop tool actions and gateway paths share the same PEP/audit/OTel context; reduce remaining harness duplication. |
| Registry and skills | `reference_project/eam-agent/packages/registry-client`, `packages/skill-runtime` | `packages/registry-client`, `packages/skill-runtime`, `skills-lock.json` | Partial. Packages exist; lockfile is currently untracked local state. | Decide tracked vs generated lockfile policy; connect registry trust decisions to runtime install/activation UI and CLI. |
| Audit and tracing | `reference_project/eam-agent/packages/audit-ledger`, `docs/plane/eam-agent-tracing` | `packages/audit-ledger`, `docs/plane/kirakira-agent-tracing`, policy-engine ledger writer execution context | Advancing. Ledger package and tracing plane exist; policy decision/tool execution audit rows now preserve subagent role/lane execution context. | Emit OTel-compatible spans for run, tool, MCP, subagent, research, memory retrieval, and policy decisions. |
| Runtime profiles | `reference_project/eam-agent/packages/config-resolver`, `agent.toml`, `policy.yaml` | `configs/runtime/profiles.json`, `packages/config-resolver`, `scripts/runtime-profile.mjs`, daemon resolved-config startup, CLI resolver adapter | Advancing. Daemon and CLI now consume resolved config. | Move remaining CLI config subcommands and init/doctor surfaces away from local helper duplication. |
| Runtime protocol | `reference_project/eam-agent/packages/runtime-contracts`, daemon/browser/desktop clients | `packages/runtime-contracts`, daemon/browser/desktop clients, runtime manifest MCP projection | Advancing. Ack payload parsing, public MCP runtime directory, MCP tool invocation results, MCP discovery results, and desktop preload validation are centralized in runtime contracts. | Extend the same contract layer to richer gateway/audit/tracing results and live workbench projections. |
| Presentation shell | `reference_project/openhuman/app`, `reference_project/openhuman/src`, `reference_project/openhuman/design-previews` | `apps/web`, `apps/desktop`, `packages/frontend-app`, `packages/frontend-core` | Advancing. Shared workbench now has a manifest-aware swarm topology panel backed by frontend-core instead of a flat worker list. | Build product-grade navigation, inspector, research, memory, MCP, and settings views with design tokens and visual QA. |

## Agent Audit Intake

Latest four-lane audit intake on 2026-06-09:

- **EAM mechanisms:** packages are mostly present; the missing layer was a
  declarative topology projection plus a profile-driven runtime dependency
  factory that composes MCP, PDP, audit, memory, subagent, and deep-research
  dependencies for daemon, CLI, web, and desktop paths. Runtime topology now
  has public schema, resolved profile projection, launcher merge, daemon
  lane-capacity compilation, role-aware contract normalization, role-derived
  lane routing, role/requested-lane event projection, sanitized manifest
  topology projection, profile doctor topology validation, and PEP/audit
  execution context. Remaining work is bounded role defaults, event lineage
  IDs, gateway trust/audit/OTel convergence, and UI topology views.
- **Presentation:** shells and gateway are usable, but `workbench.tsx` and
  `styles.css` are too large and event-log oriented. The next UI slice should
  model OpenHuman-style tool timeline entries, citation chips, and artifact
  cards as first-class dashboard data.
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
  checks for IPC. Remaining risks: full GUI smoke automation still needs a
  non-interactive Electron harness, the workbench launcher still needs
  ProcessManager-style child supervision plus surface-aware readiness waits, and
  live Docker/daemon readiness needs a slower end-to-end gate outside focused
  unit tests.
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
  deep research from structured runtime memory profile state plus env. Subagent
  role/lane selection now comes from resolved topology contracts and rejects raw
  lane hints once a role catalog exists. Public runtime manifests now expose a
  sanitized topology summary, runtime doctor validates role/lane/handoff shape,
  and daemon MCP PEP/audit paths receive `context.execution` role metadata.
  Next work should target live MCP workbench views, gateway trust/audit/OTel
  convergence, test-harness reuse of the memory/topology contracts, and
  per-service readiness.

## Execution Queue

1. **Runtime deps factory:** create one profile-driven factory for MCP, PDP,
   audit, memory, subagent, and deep-research runtime dependencies.
   MCP/PDP/audit construction is now shared for delegate and direct daemon MCP
   paths; memory recall construction now joins daemon deep-research through a
   lazy profile/env-driven factory. Remaining work is retain/reflect/checkpoint
   wiring, harness reuse, and OTel/audit convergence.
2. **MCP runtime loop:** expose daemon MCP tools/health through
   `RuntimeManifest`, browser gateway, and desktop IPC.
   Tool invocation, typed live discovery, and direct call run-event emission
   are now wired; health/discovery UI and gateway trust/audit/OTel convergence
   remain.
3. **Memory daemon composition:** construct memory service dependencies from
   resolved runtime profile env and inject memory recall into deep research by
   default.
   Lazy daemon recall injection and structured memory profile projection are now
   wired and unit-tested; gated Docker/local integration remains.
4. **Swarm topology projection:** add resolved orchestration topology fields
   and compile them into kernel lane capacities, child runtime policy, and
   lineage events.
   Public schema, runtime profile topology projection, runtime-profile launcher
   merge, daemon lane-capacity compilation, role-aware contract normalization,
   role-derived `LaneRouter` behavior, delegate request metadata, and
   event-store/frontend role projection are now wired. Public topology manifest,
   runtime doctor topology validation, and PEP/audit execution context are now
   wired. Remaining work: child runtime policy defaults, topology lineage IDs,
   frontend topology panel, and gateway/OTel audit events.
5. **Workbench IA pass:** split `packages/frontend-app/src/workbench.tsx` into
   durable views: runs, graph, research, memory, MCP, approvals, artifacts,
   settings. First topology slice is now wired through frontend-core. Next
   data-model slice: selected subagent activity, tool timeline entries,
   citation ledger, and artifact cards.
6. **Electron full launch:** `start:desktop` now runs daemon plus renderer plus
   Electron main. Remaining work is automated GUI smoke validation and broader
   desktop IA polish.
7. **Workbench launcher supervisor:** add declarative `waitFor` gates and
   process-tree cleanup semantics so background daemon/renderer failures cannot
   race or orphan the Electron foreground process.

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
