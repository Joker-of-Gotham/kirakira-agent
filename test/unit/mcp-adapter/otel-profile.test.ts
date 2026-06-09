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

  it("selects an OpenTelemetry SDK recorder plan from env and profile OTLP configuration", () => {
    const envPlan = buildMcpOtelRecorderPlan({
      env: {
        KIRAKIRA_MCP_OTEL_MODE: "opentelemetry-sdk",
        OTEL_SERVICE_NAME: "kirakira-env",
        OTEL_TRACES_EXPORTER: "otlp",
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "https://collector.example.test/v1/traces",
        OTEL_EXPORTER_OTLP_TRACES_PROTOCOL: "http/protobuf",
        OTEL_EXPORTER_OTLP_TRACES_TIMEOUT: "7500",
      },
      profile: {
        name: "profiled-host",
        mode: "host",
        mcp: {
          telemetry: {
            mode: "memory",
            serviceName: "profile-service",
            otlp: {
              tracesEndpoint: "https://profile-collector.example.test/v1/traces",
            },
          },
        },
      },
    });
    const profilePlan = buildMcpOtelRecorderPlan({
      env: {},
      profile: {
        name: "profiled-host",
        mode: "host",
        mcp: {
          telemetry: {
            enabled: true,
            mode: "opentelemetry-sdk",
            serviceName: "profile-service",
            exporter: { type: "otlp" },
            otlp: {
              tracesEndpoint: "https://profile-collector.example.test/v1/traces",
              tracesProtocol: "http/protobuf",
              tracesTimeoutMs: 5000,
            },
          },
        },
      },
    });

    expect(envPlan).toMatchObject({
      enabled: true,
      mode: "opentelemetry-sdk",
      defaultAttributes: {
        "service.name": "kirakira-env",
        "kirakira.runtime.profile": "profiled-host",
      },
      sdk: {
        serviceName: "kirakira-env",
        tracesExporter: "otlp",
        otlp: {
          tracesEndpoint: "https://collector.example.test/v1/traces",
          tracesProtocol: "http/protobuf",
          tracesTimeoutMs: 7500,
        },
      },
    });
    expect(profilePlan).toMatchObject({
      enabled: true,
      mode: "opentelemetry-sdk",
      defaultAttributes: {
        "service.name": "profile-service",
        "kirakira.runtime.profile": "profiled-host",
      },
      sdk: {
        serviceName: "profile-service",
        tracesExporter: "otlp",
        otlp: {
          tracesEndpoint: "https://profile-collector.example.test/v1/traces",
          tracesProtocol: "http/protobuf",
          tracesTimeoutMs: 5000,
        },
      },
    });
  });

  it("constructs an OpenTelemetry SDK recorder through an injected factory", () => {
    const otelSpan = {
      spanContext: vi.fn(() => ({
        traceId: "cccccccccccccccccccccccccccccccc",
        spanId: "dddddddddddddddd",
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
    const shutdown = vi.fn();
    const sdkFactory = vi.fn(() => ({ api, shutdown }));
    const plan = buildMcpOtelRecorderPlan({
      env: {
        KIRAKIRA_MCP_OTEL_MODE: "opentelemetry-sdk",
        KIRAKIRA_MCP_OTEL_TRACER_NAME: "kirakira.sdk.mcp",
        OTEL_SERVICE_NAME: "kirakira-sdk-test",
      },
    });
    const created = createMcpOtelRecorderFromPlan({ plan, sdkFactory });

    created.recorder?.startSpan({
      name: "tools/call fs.read",
      kind: "CLIENT",
      attributes: { "mcp.method.name": "tools/call" },
    });

    expect(sdkFactory).toHaveBeenCalledWith({ plan });
    expect(created.shutdown).toBe(shutdown);
    expect(api.trace.getTracer).toHaveBeenCalledWith("kirakira.sdk.mcp", undefined);
    expect(tracer.startSpan).toHaveBeenCalledWith(
      "tools/call fs.read",
      expect.objectContaining({
        attributes: expect.objectContaining({
          "service.name": "kirakira-sdk-test",
          "mcp.method.name": "tools/call",
        }),
      }),
      expect.anything(),
    );
  });

  it("fails clearly when an OpenTelemetry SDK plan lacks a factory", () => {
    const plan = buildMcpOtelRecorderPlan({
      env: { KIRAKIRA_MCP_OTEL_MODE: "opentelemetry-sdk" },
    });

    expect(() => createMcpOtelRecorderFromPlan({ plan })).toThrow(
      /mode "opentelemetry-sdk" requires an injected OpenTelemetry SDK\/OTLP exporter factory/u,
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
