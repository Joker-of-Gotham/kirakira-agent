import { describe, expect, it, vi } from "vitest";

import {
  buildMcpOtelRecorderPlan,
  createMcpOtelRecorderFromPlan,
  type OpenTelemetryApiLike,
} from "../../../packages/mcp-adapter/src/index.js";

describe("MCP OTel recorder profile", () => {
  it("defaults to disabled tracing without profile or env opt-in", () => {
    expect(buildMcpOtelRecorderPlan({ env: {} })).toMatchObject({
      schemaVersion: 1,
      source: "runtime-profile.mcp.otel",
      enabled: false,
      mode: "off",
      tracerName: "kirakira.mcp",
      defaultAttributes: {
        "service.name": "kirakira-agent",
      },
    });
  });

  it("builds a memory recorder plan from runtime profile MCP telemetry", async () => {
    const plan = buildMcpOtelRecorderPlan({
      env: { OTEL_SERVICE_NAME: "kirakira-test" },
      profile: {
        name: "workbench-host",
        mode: "hybrid",
        mcp: {
          telemetry: {
            enabled: true,
            mode: "memory",
            tracerName: "kirakira.test.mcp",
          },
        },
      },
    });
    const created = createMcpOtelRecorderFromPlan({ plan });
    const span = created.recorder?.startSpan({
      name: "tools/call fs.read",
      attributes: { "mcp.method.name": "tools/call" },
      startTimeUnixMs: 10,
    });
    await span?.end({ status: { code: "OK" }, endTimeUnixMs: 15 });

    expect(plan).toMatchObject({
      enabled: true,
      mode: "memory",
      tracerName: "kirakira.test.mcp",
      defaultAttributes: {
        "service.name": "kirakira-test",
        "kirakira.runtime.profile": "workbench-host",
        "kirakira.runtime.mode": "hybrid",
      },
    });
    expect(created.exporter?.spans).toHaveLength(1);
    expect(created.exporter?.spans[0]).toMatchObject({
      name: "tools/call fs.read",
      status: { code: "OK" },
    });
  });

  it("constructs an OpenTelemetry API recorder from env-selected mode", () => {
    const otelSpan = {
      spanContext: vi.fn(() => ({
        traceId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        spanId: "bbbbbbbbbbbbbbbb",
      })),
      setAttributes: vi.fn(),
      end: vi.fn(),
    };
    const tracer = { startSpan: vi.fn(() => otelSpan) };
    const api: OpenTelemetryApiLike = {
      context: { active: vi.fn(() => ({})) },
      trace: {
        getTracer: vi.fn(() => tracer),
        setSpan: vi.fn((context, span) => ({ context, span })),
      },
      propagation: { inject: vi.fn() },
    };
    const plan = buildMcpOtelRecorderPlan({
      env: {
        KIRAKIRA_MCP_OTEL_MODE: "opentelemetry-api",
        KIRAKIRA_MCP_OTEL_TRACER_NAME: "kirakira.env.mcp",
        KIRAKIRA_MCP_OTEL_TRACER_VERSION: "2.0.0",
      },
    });
    const created = createMcpOtelRecorderFromPlan({ plan, api });

    created.recorder?.startSpan({ name: "tools/list", kind: "CLIENT" });

    expect(api.trace.getTracer).toHaveBeenCalledWith("kirakira.env.mcp", "2.0.0");
    expect(tracer.startSpan).toHaveBeenCalledWith(
      "tools/list",
      expect.objectContaining({
        attributes: expect.objectContaining({
          "service.name": "kirakira-agent",
        }),
      }),
      expect.anything(),
    );
  });

  it("fails clearly when an OpenTelemetry API plan lacks an adapter", () => {
    const plan = buildMcpOtelRecorderPlan({
      env: { KIRAKIRA_MCP_OTEL_MODE: "opentelemetry-api" },
    });

    expect(() => createMcpOtelRecorderFromPlan({ plan })).toThrow(
      /OpenTelemetry MCP recorder plan requires/u,
    );
  });
});
