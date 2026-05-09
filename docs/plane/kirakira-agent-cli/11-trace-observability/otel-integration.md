# OpenTelemetry integration

## Tracer provider

`createNodeTracerProvider(exporter, serviceName?)` in `packages/cli/src/trace/provider.ts`:

- Instantiates `NodeTracerProvider` from `@opentelemetry/sdk-trace-node`
- Adds `Resource` with `service.name` (default `kirakira-cli`)
- Registers a **`SimpleSpanProcessor`** with the injected `SpanExporter`

Swap exporters for OTLP HTTP/gRPC in enterprise setups without changing span instrumentation.

## Instrumentation helpers

`withSpan` / `withSpanAsync` (`spans.ts`) pull `trace.getTracer("kirakira-cli")`, start active spans named with `SpanName`, set attributes `kirakira.span.name`, record exceptions, and map success/failure to `SpanStatusCode`.

## JSONL exporter

`JsonlSpanExporter` (`exporter.ts`) implements `SpanExporter.export` by serializing `ReadableSpan` records (ids, kind, times, attributes, resource) to append-only JSON lines—useful for air-gapped diagnostics matching `telemetry.mode: local`.

## Dependencies

Declared in `packages/cli/package.json`: `@opentelemetry/api`, `@opentelemetry/sdk-trace-node`, `@opentelemetry/sdk-trace-base`, `@opentelemetry/resources`, `@opentelemetry/core`.
