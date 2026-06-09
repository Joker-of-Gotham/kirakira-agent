import { describe, expect, it } from "vitest";

import {
  ExportingMcpSpanRecorder,
  InMemoryMcpSpanExporter,
  mcpMetaFromSpanContext,
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
});
