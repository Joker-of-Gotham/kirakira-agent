# EAM Behavior Parity Matrix

Date: 2026-06-10

This report upgrades the file-level EAM parity result into behavior-level
evidence. The machine-readable source of truth is
`docs/upgrade/eam-behavior-parity.json`; `scripts/eam-parity-audit.mjs` merges
that file into audit output when it is present.

## Baseline

Command:

```powershell
node scripts/eam-parity-audit.mjs --depth files --format json --sample-size 100
```

Current file inventory result: `exact=15`, `equivalent=8`, `drift=8`,
`missing=0`, `extra=4`.

The eight drift rows are not missing EAM behavior. Each row has all source files
matched and only Kirakira-side extra files. The behavior question is therefore:
which extras are intentional Kirakira extension surfaces, and which still need
runtime validation before upgrade readiness can treat them as closed?

## Next Mechanism Gap

After the local live stdio/http MCP adapter gate, the highest-leverage remaining
mechanism gap is now product-level
`deep-research-kernel-mcp-live-research-events`: expand the adapter-level live
evidence through `KernelBridge`, `ResearchTaskExecutor`, research event
emission, citation events, and task completion.

Evidence:

- `packages/deep-research/src`
- `packages/deep-research/src/file.ts`
- `packages/deep-research/src/mcp.ts`
- `packages/deep-research/src/source-adapters.ts`
- `packages/deep-research/src/web.ts`
- `packages/runtime-daemon/src/bridge/deep-research.ts`
- `test/unit/deep-research/file.test.ts`
- `test/unit/deep-research/mcp.test.ts`
- `test/unit/deep-research/planner.test.ts`
- `test/unit/deep-research/web.test.ts`
- `test/unit/runtime-daemon/deep-research-mcp-source.test.ts`
- `test/unit/runtime-daemon/kernel-bridge-subagent.test.ts`
- `test/unit/orchestrator-kernel/research-event-bridge.test.ts`
- `test/smoke/deep-research/live-adapters-smoke.test.ts`
- `scripts/deep-research-live-adapters.mjs`
- `docs/upgrade/gates/deep-research-live-adapters.json`

Focused validation command:

```powershell
pnpm exec vitest run test/unit/deep-research/mcp.test.ts test/unit/deep-research/web.test.ts test/unit/deep-research/file.test.ts test/unit/deep-research/planner.test.ts
pnpm exec vitest run test/unit/runtime-daemon/deep-research-mcp-source.test.ts test/unit/runtime-daemon/kernel-bridge-subagent.test.ts test/unit/orchestrator-kernel/task-executor.test.ts
node scripts/deep-research-live-adapters.mjs --profile workbench-host --live
```

## External Behavior Constraints

- MCP 2025-11-25 `CallToolResult` requires `content`, supports
  `structuredContent`, and says tool-originated errors should be returned inside
  tool results with `isError: true` rather than as protocol-level JSON-RPC
  errors: <https://modelcontextprotocol.io/specification/2025-11-25/schema>.
- MCP 2025-11-25 Tools defines `tools/list` and `tools/call` as the standard
  server-side tool discovery and invocation methods used by the live MCP adapter
  gate: <https://modelcontextprotocol.io/specification/2025-11-25/server/tools>.
- OpenTelemetry MCP semantic conventions map MCP `tools/call` spans to
  `gen_ai.operation.name=execute_tool` and show `gen_ai.tool.name`,
  `jsonrpc.request.id`, `mcp.method.name`, and transport attributes as the
  expected tool-call span evidence:
  <https://opentelemetry.io/docs/specs/semconv/gen-ai/mcp/>.

## Drift Classification

| Drift row | Classification | Behavior status | Behavior evidence | Remaining gap |
| --- | --- | --- | --- | --- |
| `agent-runtime` | Intentional Kirakira extension | Covered | Runtime capability scoping, delegated execution, and concrete scoped child runtime dependency forks are covered by `test/unit/agent-runtime/capability-scope.test.ts`, `react-loop-delegate.test.ts`, and `tool-executor-scope.test.ts`. | None. |
| `cli` | Intentional Kirakira extension | Covered | Runtime profile/doctor command bridge is covered by unit and contract CLI tests; runtime script names now sit behind a typed registry; read-only MCP commands and the TUI now resolve profile-projected MCP config with local custom-server overlay; provider setup and home-screen states now have focused Ink render/input coverage. | None. |
| `config-resolver` | Intentional Kirakira extension | Covered | `runtime-projection.ts` is covered by resolved-state, schema, and runtime-profile tests. | Caller migration remains sequencing work, not a parity gap in the projection behavior. |
| `eamd -> kirakirad` | Intentional Kirakira extension | Covered | The rename rule maps EAM daemon files to `kirakirad`; only `go.sum` is extra. | None. |
| `mcp-adapter` | Intentional Kirakira extension | Covered | Gateway context, OTel bridge, and OTel profile tests cover trust/policy/audit metadata, W3C trace metadata, MCP `tools/call` span fields, profile/env-selected recorder plans, SDK/OTLP factory selection, daemon-hosted SDK export injection, tool-result errors with `isError`, and live stdio/HTTP daemon-owned propagation smoke coverage. | None. |
| `memory-store` | Intentional Kirakira extension | Covered | Daemon checkpoint repository selection, checkpoint envelope compatibility, daemon retain/reflect service bridge contracts, reflect runtime event kinds, reflect started/completed/failed event emission, and the isolated `test-host` live gate are covered. `node scripts/memory-persistence-smoke.mjs --profile test-host --live` passed unit checkpoint/retain contracts plus live checkpoint, retain/recall, reflect observation, belief, and outbox persistence tests; durable evidence is in `docs/upgrade/gates/memory-persistence-smoke.json`. | None. |
| `orchestrator-kernel` | Intentional Kirakira extension | Covered | Task executor and daemon orchestrator tests cover subagent bridge execution, research execution, bounded evidence output, topology lane routing, role defaults, deterministic lineage IDs, handoff edge IDs, permission metadata, async checkpoint events, and top-level agent-runtime delegate metadata fields. Runtime-daemon KernelBridge coverage now exercises daemon-owned memory research source composition, default memory dependency source creation, bounded recall success and failure events, memory-backed checkpoint selection, and multiple daemon memory source fanout through the orchestrator research executor. | None. |
| `runtime-daemon` | Intentional Kirakira extension | Covered | MCP runtime, daemon MCP tool gateway, memory runtime deps, daemon config, socket path, browser gateway, lifecycle tests, selected-profile helper coverage, profile-owned workbench smoke gate contracts, and the live web + desktop presentation smoke gate cover the new composition surfaces. Delegated ToolExecutor paths now use the daemon gateway; `runtimeProfileComposition` now feeds daemon config, lifecycle topology, MCP server registration, MCP OTel recorder plans, memory service selection, and workspace defaults; SDK-owned MCP export uses a daemon-hosted OTLP HTTP/JSON factory; retain/reflect memory operations share the daemon memory service path with typed runtime events. Durable live gate evidence is in `docs/upgrade/gates/workbench-presentation-smoke.json`. | None. |

## Extra Target Entries

The four extra package entries are product-level Kirakira extensions, not EAM
parity failures:

| Extra package | Behavior status | Reason |
| --- | --- | --- |
| `deep-research` | Partial | Standalone deep-research package supports kernel research nodes, daemon composition, generic same-kind source adapter fanout, workspace-bounded file evidence through the daemon default source path, configurable HTTPS-first web evidence, provider-neutral MCP tool-call evidence, and local live stdio/http MCP adapter execution; the remaining product gap is the full KernelBridge and ResearchTaskExecutor live MCP research event path. |
| `frontend-app` | Partial | Shared web and desktop workbench presentation is outside the EAM package baseline. |
| `frontend-core` | Partial | Browser-safe projection selectors are outside the EAM package baseline. |
| `runtime-contracts` | Covered | Centralized daemon/browser/desktop protocol contracts are covered by runtime contract tests. |

## Harness/API Hardcoding Evidence

`scripts/upgrade-readiness.mjs` now emits `gates.harnessHardcoding` as
machine-readable evidence for the unrelated dev-server port guard. The gate
records `forbiddenPort=5173` and per-scope match counts for the runtime profile
projection, startup fragment, readiness fragment, and MCP config fragment.
Readiness should treat nonzero matches in any scope as an actionable Harness /
SDK / API contract failure instead of relying on a prose assertion.

The same readiness report also emits `gates.presentationProjection`, which
cross-checks `presentation:web` and `presentation:desktop` readiness targets
against `KIRAKIRA_WEB_URL` and `KIRAKIRA_DESKTOP_RENDERER_URL` from the runtime
profile env fragment. This keeps presentation readiness tied to the profile
projection instead of duplicating port-specific constants in the readiness gate.

`gates.deepResearchLiveAdapters` now keeps adapter-level live research evidence
machine-visible. It requires unit-evidenced file, web, and MCP source adapter
suites, then reads `docs/upgrade/gates/deep-research-live-adapters.json` and
passes only when the profile, required suites, unit tests, live tests, and MCP
checks match the current gate contract.

## Readiness Interpretation

File-level parity no longer blocks on unknown drift: all eight drift rows are
classified as intentional Kirakira extension surfaces. Upgrade readiness should
treat the EAM file-drift rows as closed when all classified package rows are
`covered`; remaining product-level extension work belongs in targeted roadmap
gates rather than as EAM package parity open work.
