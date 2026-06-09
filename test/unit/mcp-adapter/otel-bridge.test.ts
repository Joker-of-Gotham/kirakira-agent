import { describe, expect, it, vi } from "vitest";

import {
  ExportingMcpSpanRecorder,
  InMemoryMcpSpanExporter,
  createOpenTelemetryMcpSpanRecorder,
  mcpMetaFromSpanHandle,
  mcpMetaFromSpanContext,
  type OpenTelemetryApiLike,
} from "../../../packages/mcp-adapter/src/otel-bridge.js";

describe("MCP OTel bridge", () => {
  it("exports ended spans and exposes MCP trace metadata", async () => {
    const exporter = new InMemoryMcpSpanExporter();
    const recorder = new ExportingMcpSpanRecorder(exporter);
    const span = recorder.startSpan({
      name: "tools/call search",
      kind: "CLIENT",
      traceId: "0123456789abcdef0123456789abcdef",
      attributes: {
        "mcp.method.name": "tools/call",
        "gen_ai.operation.name": "execute_tool",
        "gen_ai.tool.name": "search",
      },
      startTimeUnixMs: 100,
    });

    span.setAttributes({ "mcp.server.name": "docs" });
    await span.end({
      status: { code: "OK" },
      endTimeUnixMs: 125,
    });

    expect(mcpMetaFromSpanContext(span.context)).toEqual({
      traceparent: `00-0123456789abcdef0123456789abcdef-${span.context.spanId}-01`,
    });
    expect(exporter.spans).toHaveLength(1);
    expect(exporter.spans[0]).toMatchObject({
      name: "tools/call search",
      kind: "CLIENT",
      context: {
        traceId: "0123456789abcdef0123456789abcdef",
        spanId: span.context.spanId,
      },
      attributes: {
        "mcp.method.name": "tools/call",
        "mcp.server.name": "docs",
        "gen_ai.operation.name": "execute_tool",
        "gen_ai.tool.name": "search",
      },
      startTimeUnixMs: 100,
      endTimeUnixMs: 125,
      durationMs: 25,
      status: { code: "OK" },
    });
  });

  it("preserves tracestate and baggage in MCP metadata without requiring OTel", async () => {
    const exporter = new InMemoryMcpSpanExporter();
    const recorder = new ExportingMcpSpanRecorder(exporter);
    const span = recorder.startSpan({
      name: "tools/call search",
      traceContext: {
        traceparent: "00-11111111111111111111111111111111-2222222222222222-01",
        tracestate: "rojo=00f067aa0ba902b7,congo=t61rcWkgMzE",
        baggage: "tenant=acme,run=run-1",
      },
      startTimeUnixMs: 100,
    });

    await span.end({ status: { code: "OK" }, endTimeUnixMs: 125 });

    expect(span.context).toMatchObject({
      traceId: "11111111111111111111111111111111",
      parentSpanId: "2222222222222222",
      traceState: "rojo=00f067aa0ba902b7,congo=t61rcWkgMzE",
    });
    expect(mcpMetaFromSpanHandle(span)).toEqual({
      traceparent: `00-11111111111111111111111111111111-${span.context.spanId}-01`,
      tracestate: "rojo=00f067aa0ba902b7,congo=t61rcWkgMzE",
      baggage: "tenant=acme,run=run-1",
    });
  });

  it("adapts an OpenTelemetry API-like tracer and propagator", () => {
    const otelSpan = {
      spanContext: vi.fn(() => ({
        traceId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        spanId: "bbbbbbbbbbbbbbbb",
        traceState: { serialize: () => "rojo=bbbbbbbbbbbbbbbb" },
      })),
      setAttributes: vi.fn(),
      setStatus: vi.fn(),
      end: vi.fn(),
    };
    const tracer = {
      startSpan: vi.fn(() => otelSpan),
    };
    const api: OpenTelemetryApiLike = {
      context: {
        active: vi.fn(() => ({ active: true })),
      },
      trace: {
        getTracer: vi.fn(() => tracer),
        setSpan: vi.fn((context, span) => ({ context, span })),
      },
      propagation: {
        extract: vi.fn((context, carrier) => ({ context, carrier, extracted: true })),
        inject: vi.fn((_context, carrier, setter) => {
          setter?.set(
            carrier,
            "traceparent",
            "00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01",
          );
          setter?.set(carrier, "tracestate", "rojo=bbbbbbbbbbbbbbbb");
          setter?.set(carrier, "baggage", "tenant=acme,run=run-1");
        }),
      },
      SpanKind: { CLIENT: "client-kind" },
      SpanStatusCode: { OK: "ok-status" },
    };
    const recorder = createOpenTelemetryMcpSpanRecorder({
      api,
      tracerName: "test.mcp",
      tracerVersion: "1.0.0",
      defaultAttributes: { "service.name": "kirakira-test" },
    });

    const span = recorder.startSpan({
      name: "tools/call search",
      kind: "CLIENT",
      traceContext: {
        traceparent: "00-11111111111111111111111111111111-2222222222222222-01",
        tracestate: "rojo=2222222222222222",
        baggage: "tenant=acme",
      },
      attributes: { "mcp.method.name": "tools/call" },
      startTimeUnixMs: 100,
    });

    expect(api.trace.getTracer).toHaveBeenCalledWith("test.mcp", "1.0.0");
    expect(api.propagation.extract).toHaveBeenCalledWith(
      { active: true },
      {
        traceparent: "00-11111111111111111111111111111111-2222222222222222-01",
        tracestate: "rojo=2222222222222222",
        baggage: "tenant=acme",
      },
      expect.any(Object),
    );
    expect(tracer.startSpan).toHaveBeenCalledWith(
      "tools/call search",
      {
        kind: "client-kind",
        attributes: {
          "service.name": "kirakira-test",
          "mcp.method.name": "tools/call",
        },
        startTime: 100,
      },
      expect.objectContaining({ extracted: true }),
    );
    expect(mcpMetaFromSpanHandle(span)).toEqual({
      traceparent: "00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01",
      tracestate: "rojo=bbbbbbbbbbbbbbbb",
      baggage: "tenant=acme,run=run-1",
    });

    span.setAttributes({ "gen_ai.operation.name": "execute_tool" });
    span.end({ status: { code: "OK" }, endTimeUnixMs: 125 });

    expect(otelSpan.setAttributes).toHaveBeenCalledWith({
      "gen_ai.operation.name": "execute_tool",
    });
    expect(otelSpan.setStatus).toHaveBeenCalledWith({ code: "ok-status" });
    expect(otelSpan.end).toHaveBeenCalledWith(125);
  });
});
