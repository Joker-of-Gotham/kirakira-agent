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

## External Behavior Constraints

- MCP 2025-11-25 `CallToolResult` requires `content`, supports
  `structuredContent`, and says tool-originated errors should be returned inside
  tool results with `isError: true` rather than as protocol-level JSON-RPC
  errors: <https://modelcontextprotocol.io/specification/2025-11-25/schema>.
- OpenTelemetry MCP semantic conventions map MCP `tools/call` spans to
  `gen_ai.operation.name=execute_tool` and show `gen_ai.tool.name`,
  `jsonrpc.request.id`, `mcp.method.name`, and transport attributes as the
  expected tool-call span evidence:
  <https://opentelemetry.io/docs/specs/semconv/gen-ai/mcp/>.

## Drift Classification

| Drift row | Classification | Behavior status | Behavior evidence | Remaining gap |
| --- | --- | --- | --- | --- |
| `agent-runtime` | Intentional Kirakira extension | Partial | Runtime capability scoping and delegate runner are covered by `test/unit/agent-runtime/capability-scope.test.ts`, `react-loop-delegate.test.ts`, and `tool-executor-scope.test.ts`. | Concrete forked child runtime dependencies still need to replace parent dependency reuse where possible. |
| `cli` | Intentional Kirakira extension | Partial | Runtime profile/doctor command bridge is covered by unit and contract CLI tests; runtime script names now sit behind a typed registry; read-only MCP commands and the TUI now resolve profile-projected MCP config with local custom-server overlay. | Provider setup and home-screen UI still need focused TUI coverage when the workbench IA changes. |
| `config-resolver` | Intentional Kirakira extension | Covered | `runtime-projection.ts` is covered by resolved-state, schema, and runtime-profile tests. | Caller migration remains sequencing work, not a parity gap in the projection behavior. |
| `eamd -> kirakirad` | Intentional Kirakira extension | Covered | The rename rule maps EAM daemon files to `kirakirad`; only `go.sum` is extra. | None. |
| `mcp-adapter` | Intentional Kirakira extension | Partial | Gateway context, OTel bridge, and OTel profile tests cover trust/policy/audit metadata, W3C trace metadata, MCP `tools/call` span fields, profile/env-selected recorder plans, SDK/OTLP factory selection, daemon-hosted SDK export injection, and tool-result errors with `isError`. | Live propagation smoke coverage across daemon-owned MCP transports remains. |
| `memory-store` | Intentional Kirakira extension | Partial | Daemon checkpoint repository selection, checkpoint envelope compatibility, daemon retain/reflect service bridge contracts, reflect runtime event kinds, and reflect started/completed/failed event emission have focused tests. | Live Docker/local checkpoint plus retain/reflect persistence validation remains. |
| `orchestrator-kernel` | Intentional Kirakira extension | Partial | Task executor and daemon orchestrator tests cover subagent bridge execution, research execution, bounded evidence output, topology lane routing, role defaults, deterministic lineage IDs, handoff edge IDs, permission metadata, async checkpoint events, and top-level agent-runtime delegate metadata fields. | Expand behavior validation from injected adapters to live daemon source adapters where practical. |
| `runtime-daemon` | Intentional Kirakira extension | Partial | MCP runtime, daemon MCP tool gateway, memory runtime deps, daemon config, socket path, browser gateway, and lifecycle tests cover the new composition surfaces. Delegated ToolExecutor paths now use the daemon gateway, profile-selected MCP OTel recorder plans are injected into daemon MCP dependencies, SDK-owned MCP export uses a daemon-hosted OTLP HTTP/JSON factory, and retain/reflect memory operations share the daemon memory service path with typed runtime events. | Regular live Docker/local web and desktop smoke gates plus remaining daemon lifecycle/runtime-profile projection deduplication remain. |

## Extra Target Entries

The four extra package entries are product-level Kirakira extensions, not EAM
parity failures:

| Extra package | Behavior status | Reason |
| --- | --- | --- |
| `deep-research` | Partial | Standalone deep-research package supports kernel research nodes and daemon composition; live source adapters remain gated. |
| `frontend-app` | Partial | Shared web and desktop workbench presentation is outside the EAM package baseline. |
| `frontend-core` | Partial | Browser-safe projection selectors are outside the EAM package baseline. |
| `runtime-contracts` | Covered | Centralized daemon/browser/desktop protocol contracts are covered by runtime contract tests. |

## Readiness Interpretation

File-level parity no longer blocks on unknown drift: all eight drift rows are
classified as intentional Kirakira extension surfaces. Upgrade readiness should
continue to warn while six rows remain `partial`, because the remaining work is
live validation or integration closure rather than source inventory repair.
The readiness report also expands these partial rows into machine-readable open
work items so the high structural score is not mistaken for final completion.
