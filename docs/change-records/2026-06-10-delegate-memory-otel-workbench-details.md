# Delegate Metadata, Memory Bridge, OTel, And Workbench Details

Date: 2026-06-10
Branch: `codex/runtime-orchestration-profile-baseline`

## Scope

This slice advances the four upgrade tracks while preserving the Kirakira-owned
runtime endpoints: web at `http://127.0.0.1:5183/`, desktop renderer at
`http://127.0.0.1:5174/`, and browser gateway at
`ws://127.0.0.1:17373/runtime`.

## Changes

- Promoted subagent `permissions`, `topology`, and `lineage` metadata into
  first-class `@kirakira/agent-runtime` delegate request and worker config
  fields, while keeping legacy `action.args` compatibility.
- Routed orchestrator delegate bridge calls through those top-level metadata
  fields so swarm lineage, handoff, and permission data no longer depend on
  untyped request payloads.
- Added daemon MCP OTel recorder selection from the resolved runtime profile,
  including disabled, in-memory, supplied API, supplied exporter, and explicit
  recorder override paths.
- Added a typed daemon memory retain/reflect bridge that invokes the lazy
  memory service path, exposes service-outbox destinations, and emits existing
  retain runtime events when a run event sink and run id are present.
- Added shared frontend-core view models for selected subagent details,
  citation ledger rows, artifact detail cards, and visual-QA hooks; web and
  Electron renderer consume the same projection.
- Extended upgrade readiness reporting with `openWork` rows derived from
  behavior parity gaps so structural readiness scores do not hide remaining
  integration work.

## References

- MCP `CallToolResult` schema and tool-originated `isError` semantics:
  https://modelcontextprotocol.io/specification/2025-11-25/schema
- OpenTelemetry MCP semantic conventions:
  https://opentelemetry.io/docs/specs/semconv/gen-ai/mcp/
- OpenAI Agents SDK handoff model:
  https://openai.github.io/openai-agents-js/guides/handoffs/
- Docker Compose startup order and health waits:
  https://docs.docker.com/compose/how-tos/startup-order/
- Electron security model:
  https://www.electronjs.org/docs/latest/tutorial/security

## Validation

- `pnpm.cmd exec vitest run test/unit/agent-runtime/react-loop-delegate.test.ts test/unit/orchestrator-kernel/subagent-contract.test.ts`
- `pnpm.cmd exec vitest run test/unit/runtime-daemon/mcp-runtime.test.ts test/unit/runtime-daemon/agent-mcp-tool-gateway.test.ts test/unit/runtime-daemon/memory-runtime-deps.test.ts`
- `pnpm.cmd exec vitest run test/unit/frontend-core test/unit/scripts/upgrade-readiness.test.ts`
- `pnpm.cmd --filter @kirakira/agent-runtime typecheck`
- `pnpm.cmd --filter @kirakira/orchestrator-kernel typecheck`
- `pnpm.cmd --filter @kirakira/runtime-daemon typecheck`
- `pnpm.cmd --filter @kirakira/memory-service typecheck`
- `pnpm.cmd --filter @kirakira/frontend-core typecheck`
- `pnpm.cmd --filter @kirakira/frontend-core build`
- `pnpm.cmd --filter @kirakira/frontend-app typecheck`
- `pnpm.cmd --filter @kirakira/frontend-app build`
- `pnpm.cmd --filter @kirakira/web build`
- `pnpm.cmd --filter @kirakira/desktop typecheck`
- `pnpm.cmd --filter @kirakira/desktop build`
- `node scripts/upgrade-readiness.mjs --format json`
- `node scripts/eam-parity-audit.mjs --depth files --format json --sample-size 100`
- `pnpm.cmd e2e:workbench -- --profile workbench-host --surface web --timeout-ms 120000 --dry-run`
- `pnpm.cmd e2e:workbench -- --profile workbench-host --surface desktop --timeout-ms 120000 --dry-run`
- In-app browser check against `http://127.0.0.1:5183/`: title
  `Kirakira Agent`, mock run submitted, Agents and Research views populated,
  citation ledger and artifact detail cards visible, no browser console
  warnings or errors.

## Remaining Risks

- Live Docker/local checkpoint, retain/reflect, web, and Electron smoke gates
  still need a slower execution window.
- Real OTLP/OpenTelemetry SDK exporter construction remains separate from the
  current profile-selected recorder planning path.
- Reflect timeline events are intentionally not emitted until
  `@kirakira/runtime-contracts` owns explicit `memory.reflect.*` event kinds.
