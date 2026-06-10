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

## Current Release State

This roadmap is now a maintenance control surface, not an open implementation
queue. The release bar is closed by commit `31c9106`: `upgrade-readiness`
reports `25 pass / 0 warn / 0 fail`, file-level EAM parity reports
`missing=0`, all ten behavior drift rows are `covered`, and
`docs/upgrade/gates/runtime-full-lifecycle-gate.json` is a matching
Docker-backed `passed` artifact.

| Track | Release state | Current evidence | Maintenance rule |
| --- | --- | --- | --- |
| EAM mechanism parity | Closed for the current upgrade | Rename-aware file parity reports `exact=13`, `equivalent=8`, `drift=10`, `missing=0`, `extra=4`; the behavior matrix classifies and covers all ten drift rows. | New EAM drift must add source, intent, tests, gate evidence, and behavior classification before readiness can stay green. |
| Web and Electron presentation | Closed for the current upgrade | Web `5183`, desktop renderer `5174`, gateway `17373`, fast hydrated QA, and full-lifecycle hydrated QA artifacts all pass with no forbidden `5173` dependency. | New product surfaces must update DESIGN/tokens and rerun hydrated QA. |
| Hardcoding, harness, SDK/API | Closed for the current upgrade | Runtime profile projection, gate identity, model metadata catalog, MCP gateway context, memory events, and release checks are shared through contracts and focused tests. | New harness branches must consume resolved profile/contract projections instead of adding private constants. |
| Docker/local ecosystem | Closed for the current upgrade | The no-skip full lifecycle gate passes Docker preflight, Compose `up --wait`, daemon/gateway, Web, desktop renderer, Electron shell, and full-stack hydrated QA with `targetCollisions=0`. | If Docker is unavailable during a future rerun, record blocked evidence for that rerun but do not call it release-complete. |

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

## Release Closure Notes

Earlier audit intake remains useful historical context, but it is no longer a
current open-work queue. The formerly blocked Docker lifecycle row was closed
by commit `31c9106`, which produced matching passed evidence for the slower
Docker-backed chain and separate fast/full-lifecycle hydrated visual QA
artifacts.

Current release closure:

- Runtime dependency factories, MCP gateway context, memory daemon composition,
  subagent topology projection, workbench IA, Electron launch, launcher
  supervision, and integration gates are all represented in passing readiness
  evidence.
- `integrationGates.upgrade` remains the fast, renderer-level aggregate gate.
  Its hydrated visual QA child is intentionally marked
  `execution=mock/skipInfra/skipDaemon`.
- `runtimeLifecycleGates.runtime-full-lifecycle` remains the authoritative
  no-skip Docker-backed release gate. Its current artifact is `passed`, with
  Docker preflight passed and `targetCollisions=0`.
- Future density, transport, registry UI, or telemetry expansions are normal
  product evolution. They must add tests and gate evidence, but they are not
  open work for the 2026-06-10 terminal upgrade.

## Maintenance Queue

1. Keep topology, deep-research adapter, MCP gateway, memory persistence, and
   hydrated visual QA assertions current whenever those mechanisms evolve.
2. Keep release evidence separated by execution identity: fast renderer QA uses
   `presentation-hydrated-visual-qa`; no-skip lifecycle QA uses
   `presentation-hydrated-visual-qa-full-lifecycle`.
3. Keep `skills-lock.json` local-only and use `kirakira.lock` for auditable
   registry/skill state.
4. Keep Web `5183`, desktop renderer `5174`, and browser gateway `17373`
   profile-owned; `5173` remains an unrelated local port.
5. Keep every release update ending with focused checks, `upgrade-readiness`,
   EAM parity, `git push`, `git ls-remote`, and a final worktree audit.

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
  Full-stack visual validation is covered by the no-skip lifecycle gate and
  should be rerun for release-affecting changes.
- Every ecosystem/lifecycle change must run or dry-run the full lifecycle gate:
  `node scripts/runtime-full-lifecycle-gate.mjs --gate runtime-full-lifecycle --profile workbench-host --live --timeout-ms 240000`.
  A release-complete run requires `status=passed` and `preflight.status=passed`.
  If Docker Desktop is unavailable in a future rerun, record blocked evidence
  for that rerun without replacing the current passed release artifact.
- Every ecosystem change must end with `git push`, `git ls-remote`, and a final
  worktree status check.
