# Reflect Events, OTel SDK Factory, CLI MCP Profile Reads, And Smoke Targets

Date: 2026-06-10
Branch: `codex/runtime-orchestration-profile-baseline`

## Scope

This slice closes several open work rows without changing the project-owned
presentation endpoints: web remains `http://127.0.0.1:5183/`, desktop renderer
remains `http://127.0.0.1:5174/`, and the browser gateway remains
`ws://127.0.0.1:17373/runtime`.

## Changes

- Added central `memory.reflect.started`, `memory.reflect.completed`, and
  `memory.reflect.failed` runtime event kinds, plus strict event-kind
  validation for runtime capability manifests.
- Emitted typed daemon reflect lifecycle events around memory-service reflect
  calls while preserving existing service-outbox receipt behavior.
- Added an explicit `opentelemetry-sdk` MCP recorder mode with OTLP
  env/profile planning and an injected SDK/exporter factory boundary. The
  adapter fails clearly when SDK export is requested without a concrete factory.
- Added a CLI MCP config resolver that reads the runtime-profile MCP projection
  first, overlays non-conflicting local custom servers, and keeps
  add/import/link/remove as local `.mcp.json` mutation commands with profile
  shadowing warnings.
- Added explicit workbench smoke `targets` to dry-run reports so validation
  output names the selected profile-derived web, desktop, and gateway
  endpoints directly.
- Updated behavior parity and roadmap docs so completed reflect and CLI MCP
  projection work no longer appear as remaining open work.

## References

- OpenTelemetry JS SDK guidance:
  https://opentelemetry.io/docs/languages/js/
- OpenTelemetry OTLP exporter env configuration:
  https://opentelemetry.io/docs/languages/sdk-configuration/otlp-exporter/
- OpenTelemetry MCP semantic conventions:
  https://opentelemetry.io/docs/specs/semconv/gen-ai/mcp/
- MCP schema:
  https://modelcontextprotocol.io/specification/2025-11-25/schema

## Validation

- `pnpm.cmd exec vitest run test/unit/runtime-contracts test/unit/runtime-daemon/memory-runtime-deps.test.ts test/unit/mcp-adapter/otel-profile.test.ts test/unit/scripts/workbench-smoke.test.ts`
- `pnpm.cmd exec vitest run test/unit/cli/runtime-mcp-config.test.ts test/unit/cli`
- `pnpm.cmd --filter @kirakira/runtime-contracts build`
- `pnpm.cmd --filter @kirakira/runtime-daemon typecheck`
- `pnpm.cmd --filter @kirakira/mcp-adapter typecheck`
- `pnpm.cmd --filter @kirakira/cli typecheck`
- `pnpm.cmd exec vitest run test/contract/runtime/workbench-smoke-gate.test.ts test/contract/cli/runtime-profile-command.test.ts test/contract/cli/runtime-doctor-command.test.ts test/unit/runtime/profile-resolution.test.ts test/unit/scripts/workbench-launcher.test.ts`
- `pnpm.cmd exec vitest run test/unit/mcp-adapter test/unit/runtime-daemon/mcp-runtime.test.ts test/unit/runtime-daemon/agent-mcp-tool-gateway.test.ts`
- `node scripts/upgrade-readiness.mjs --format json` (`openWork=9`)
- `node scripts/eam-parity-audit.mjs --depth files --format json --sample-size 100`
- `pnpm.cmd e2e:workbench -- --profile workbench-host --surface web --timeout-ms 120000 --dry-run`
- `pnpm.cmd e2e:workbench -- --profile workbench-host --surface desktop --timeout-ms 120000 --dry-run`

## Remaining Risks

- OpenTelemetry SDK/OTLP host injection was still open in this slice and was
  later closed by
  `docs/change-records/2026-06-10-daemon-mcp-otel-sdk-factory.md`.
- Live Docker/local checkpoint, retain/reflect, web, and Electron smoke gates
  still need a slower execution window.
