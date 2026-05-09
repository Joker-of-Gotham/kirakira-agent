# Trace and observability

Tracing spans **OpenTelemetry** primitives and projects Kirakira-specific names onto spans via `withSpan` helpers (`packages/cli/src/trace/spans.ts`). Audit JSONL complements traces for compliance.

## Modules

| File | Role |
|------|------|
| `spans.ts` | `withSpan`, `withSpanAsync`, `sessionStartSpan`, `promptSubmitSpan` |
| `provider.ts` | `createNodeTracerProvider` (resource + `SimpleSpanProcessor`) |
| `context.ts` | Trace context utilities |
| `exporter.ts` | `JsonlSpanExporter` appends serialized spans |
| `audit.ts` | `appendAuditEntry` → `~/.kirakira/traces/audit.jsonl` default |

## Types

`SpanName`, `TraceSpan`, `AuditEntry` — `packages/core/src/types/trace.ts`. Canonical name list also exported as `SPAN_NAMES` in `packages/core/src/constants.ts`.

## Config

`agent.toml` `telemetry` section toggles OTEL (`packages/core/src/schemas/config.ts`).

## Related docs

- [OTel integration](./otel-integration.md)
- [Span catalog](./span-catalog.md)
- [Audit log](./audit-log.md)
