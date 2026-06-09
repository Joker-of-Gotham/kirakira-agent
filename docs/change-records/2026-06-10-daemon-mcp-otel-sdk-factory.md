# Daemon MCP OTel SDK Factory

Date: 2026-06-10
Branch: `codex/runtime-orchestration-profile-baseline`

## Scope

This slice turns the MCP `opentelemetry-sdk` recorder mode from a host-planning
contract into a runtime-daemon owned OTLP HTTP/JSON implementation. Kirakira
presentation endpoints remain unchanged: web `http://127.0.0.1:5183/`, desktop
renderer `http://127.0.0.1:5174/`, and browser gateway
`ws://127.0.0.1:17373/runtime`.

## Changes

- Added a runtime-daemon MCP OTel SDK factory backed by official OpenTelemetry
  Node tracer provider, batch span processor, and OTLP HTTP trace exporter.
- Wired the factory into `createDaemonMcpDependencies()` when the selected
  runtime profile resolves MCP telemetry mode to `opentelemetry-sdk`.
- Preserved injection for tests and alternate hosts through
  `mcpOtelSdkFactory`, including an explicit `null` path for diagnosable
  missing-factory errors.
- Plumbed SDK shutdown through daemon MCP dependencies so exporter/provider
  lifecycle is closed with the daemon dependency owner.
- Updated behavior parity and roadmap state so the remaining MCP OTel gap is
  live propagation smoke coverage, not concrete factory injection.

## References

- OpenTelemetry JavaScript exporters:
  https://opentelemetry.io/docs/languages/js/exporters/
- OpenTelemetry OTLP specification:
  https://opentelemetry.io/docs/specs/otlp/
- OpenTelemetry JavaScript OTLP HTTP trace exporter implementation:
  https://github.com/open-telemetry/opentelemetry-js/blob/main/experimental/packages/exporter-trace-otlp-http/src/platform/node/OTLPTraceExporter.ts

## Validation

- `pnpm.cmd --filter @kirakira/mcp-adapter build`
- `pnpm.cmd --filter @kirakira/runtime-daemon typecheck`
- `pnpm.cmd --filter @kirakira/runtime-daemon build`
- `pnpm.cmd exec vitest run test/unit/mcp-adapter/otel-profile.test.ts test/unit/runtime-daemon/mcp-runtime.test.ts`

## Remaining Risks

- Live propagation smoke coverage across daemon-owned MCP transports still
  needs a slower environment with a real collector and MCP server process.
- Broader Docker/local web and Electron smoke gates remain opt-in live checks.
