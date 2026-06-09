import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { McpAuth, McpServerConfig, McpTransport, ResolvedConfig } from "@kirakira/core";
import {
  ExportingMcpSpanRecorder,
  InMemoryMcpSpanExporter,
  type McpAuditBridge,
  type McpClientManager,
  type McpOtelSdkFactory,
  type OpenTelemetryApiLike,
} from "@kirakira/mcp-adapter";
import type { EnforcementResult, McpPep } from "@kirakira/policy-engine";
import { describe, expect, it, vi } from "vitest";
import {
  DaemonMcpRuntime,
  createDaemonMcpDependencies,
} from "../../../packages/runtime-daemon/src/index.js";
import { runtimeProfileComposition } from "../../../packages/runtime-daemon/src/bridge/runtime-profile.js";

function decision(effect: "allow" | "deny" | "escalate"): EnforcementResult {
  return {
    allowed: effect === "allow",
    traceId: "trace-1",
    decision: {
      version: "kirakira.decision.v1",
      decision_id: "decision-1",
      request_id: "request-1",
      effect,
      reason_codes: effect === "allow" ? ["baseline_read_workspace"] : ["policy_denied"],
      policy: {
        bundle_id: "test-bundle",
        revision: "test",
        package: "test",
      },
      approval: {
        required: effect === "escalate",
        mode: effect === "escalate" ? "human" : "none",
        cacheable: effect === "allow",
      },
      obligations: [],
      explain: {
        summary: "test decision",
        matched_rules: [],
      },
    },
  };
}

function fakePep(result: EnforcementResult): McpPep {
  return {
    enforce: vi.fn(async () => result),
  } as unknown as McpPep;
}

function fakeManager(
  rawResult: unknown,
  options: {
    serverName?: string;
    transport?: McpTransport;
    auth?: McpAuth;
    trust?: McpServerConfig["trust"];
    tools?: Array<Record<string, unknown>>;
    listError?: Error;
    callError?: Error;
  } = {},
): {
  manager: McpClientManager;
  request: ReturnType<typeof vi.fn>;
  getConfig: ReturnType<typeof vi.fn>;
  registerServer: ReturnType<typeof vi.fn>;
  registerMany: ReturnType<typeof vi.fn>;
  startServer: ReturnType<typeof vi.fn>;
  stopAll: ReturnType<typeof vi.fn>;
} {
  let started = false;
  const serverName = options.serverName ?? "filesystem-core";
  const config: McpServerConfig = {
    name: serverName,
    transport: options.transport ?? { kind: "stdio", command: "node", args: ["server.js"] },
    auth: options.auth ?? { mode: "none" },
    trust: options.trust ?? "untrusted",
  };
  const defaultTools = [
    {
      name: "read_file",
      description: "Read file content",
      inputSchema: { type: "object", properties: { path: { type: "string" } } },
    },
  ];
  const listResult =
    typeof rawResult === "object" &&
    rawResult !== null &&
    Array.isArray((rawResult as { tools?: unknown }).tools)
      ? rawResult
      : { tools: options.tools ?? defaultTools };
  const request = vi.fn(async (_name: string, method: string) => {
    if (method === "tools/list") {
      if (options.listError) throw options.listError;
      return listResult;
    }
    if (method === "tools/call") {
      if (options.callError) throw options.callError;
      return rawResult;
    }
    return rawResult;
  });
  const getConfig = vi.fn((name: string) => (name === serverName ? config : undefined));
  const registerServer = vi.fn();
  const registerMany = vi.fn();
  const startServer = vi.fn(async () => {
    started = true;
  });
  const stopAll = vi.fn(async () => {});
  const manager = {
    registerMany,
    registerServer,
    listServers: vi.fn(() => [serverName]),
    getConfig,
    getHealth: vi.fn(() => (started ? "healthy" : "stopped")),
    getLastError: vi.fn(() => undefined),
    startServer,
    request,
    stopAll,
  } as unknown as McpClientManager;
  return { manager, request, getConfig, registerServer, registerMany, startServer, stopAll };
}

function resolvedRuntimeConfig(
  profiles: Array<Record<string, unknown>>,
  defaultProfile: string,
): Pick<ResolvedConfig, "runtimeState"> {
  return {
    runtimeState: {
      default_profile: defaultProfile,
      profiles,
    },
  } as unknown as Pick<ResolvedConfig, "runtimeState">;
}

describe("DaemonMcpRuntime", () => {
  it("uses runtime profile composition with runtimeState-only MCP dependency config", () => {
    const resolvedConfig = resolvedRuntimeConfig(
      [
        {
          name: "quiet-host",
          mode: "host",
          mcp_servers: [{ name: "quiet-filesystem", command: "node" }],
        },
        {
          name: "profiled-host",
          mode: "host",
          mcp_servers: [{ name: "profiled-filesystem", command: "node" }],
          memory: {
            enabled: true,
            services: [{ name: "postgres", url_env: "PROFILE_DATABASE_URL" }],
          },
        },
      ],
      "quiet-host",
    );

    expect(
      runtimeProfileComposition({
        resolvedConfig,
        runtimeProfileName: "profiled-host",
      }),
    ).toMatchObject({
      profile: { name: "profiled-host" },
      mcpServers: [{ name: "profiled-filesystem", command: "node" }],
      mcpServerNames: ["profiled-filesystem"],
      memory: {
        enabled: true,
        services: [{ name: "postgres", url_env: "PROFILE_DATABASE_URL" }],
      },
      mcpManifest: {
        profileName: "profiled-host",
        servers: [{ name: "profiled-filesystem", command: "node" }],
      },
    });
  });

  it("registers resolved profile MCP servers through the shared dependency factory", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "kirakira-mcp-deps-"));
    const manager = fakeManager({ content: [] });
    const deps = createDaemonMcpDependencies({
      workspaceRoot,
      mcpManager: manager.manager,
      mcpPep: fakePep(decision("allow")),
      runtimeProfileName: "container",
      resolvedConfig: {
        runtimeState: {
          default_profile: "host",
          profiles: [
            {
              name: "host",
              mode: "host",
              mcp_servers: [
                {
                  name: "host-filesystem",
                  command: "node",
                  args: ["host.js"],
                },
              ],
            },
            {
              name: "container",
              mode: "container",
              mcp_servers: [
                {
                  name: "container-filesystem",
                  command: "node",
                  args: ["container.js", "/workspace"],
                  env: { KIRAKIRA_WORKSPACE_ROOT: "/workspace" },
                },
              ],
            },
          ],
        },
      },
    });

    try {
      expect(deps.workspaceRoot).toBe(workspaceRoot);
      expect(manager.registerServer).toHaveBeenCalledTimes(1);
      expect(manager.registerServer).toHaveBeenCalledWith({
        name: "container-filesystem",
        transport: {
          kind: "stdio",
          command: "node",
          args: ["container.js", "/workspace"],
          env: { KIRAKIRA_WORKSPACE_ROOT: "/workspace" },
        },
        auth: { mode: "none" },
        trust: "untrusted",
      });
    } finally {
      await deps.close();
      await rm(workspaceRoot, { recursive: true, force: true });
    }
    expect(manager.stopAll).not.toHaveBeenCalled();
  });

  it("selects a profile memory MCP OTel recorder and uses it for daemon MCP spans", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "kirakira-mcp-profile-otel-"));
    const traceId = "22222222222222222222222222222222";
    const resolvedConfig = resolvedRuntimeConfig(
      [
        {
          name: "quiet-host",
          mode: "host",
          mcp: { telemetry: { enabled: false, mode: "off" } },
        },
        {
          name: "profiled-host",
          mode: "host",
          mcp: {
            telemetry: {
              enabled: true,
              mode: "memory",
              tracerName: "kirakira.test.daemon.mcp",
            },
          },
        },
      ],
      "quiet-host",
    );
    const manager = fakeManager({
      content: [{ type: "text", text: "hello" }],
      structuredContent: { ok: true },
      isError: false,
    });
    const deps = createDaemonMcpDependencies({
      workspaceRoot,
      mcpManager: manager.manager,
      mcpPep: fakePep(decision("allow")),
      resolvedConfig,
      runtimeProfileName: "profiled-host",
      mcpOtelEnv: { OTEL_SERVICE_NAME: "kirakira-test" },
    });
    const runtime = new DaemonMcpRuntime({
      workspaceRoot,
      mcpManager: manager.manager,
      mcpPep: fakePep(decision("allow")),
      resolvedConfig,
      runtimeProfileName: "profiled-host",
      mcpOtelEnv: { OTEL_SERVICE_NAME: "kirakira-test" },
    });

    try {
      expect(deps.mcpOtelRecorderPlan).toMatchObject({
        enabled: true,
        mode: "memory",
        tracerName: "kirakira.test.daemon.mcp",
        defaultAttributes: {
          "service.name": "kirakira-test",
          "kirakira.runtime.profile": "profiled-host",
          "kirakira.runtime.mode": "host",
        },
      });
      expect(deps.mcpSpanRecorder).toBeDefined();
      expect(deps.mcpOtelExporter).toBeDefined();

      const result = await runtime.callTool({
        server: "filesystem-core",
        tool: "read_file",
        arguments: { path: "README.md" },
        traceId,
      });

      expect(manager.request).toHaveBeenCalledWith("filesystem-core", "tools/list", {
        _meta: {
          traceparent: expect.stringMatching(
            /^00-22222222222222222222222222222222-[0-9a-f]{16}-01$/,
          ),
        },
      });
      expect(manager.request).toHaveBeenCalledWith("filesystem-core", "tools/call", {
        name: "read_file",
        arguments: { path: "README.md" },
        _meta: {
          traceparent: expect.stringMatching(
            /^00-22222222222222222222222222222222-[0-9a-f]{16}-01$/,
          ),
        },
      });
      expect(result).toMatchObject({
        success: true,
        structuredContent: { ok: true },
        isError: false,
        otel: {
          traceId,
          spanId: expect.stringMatching(/^[0-9a-f]{16}$/),
          status: "OK",
        },
      });
    } finally {
      await runtime.close();
      await deps.close();
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("honors disabled MCP OTel mode while preserving inbound trace context", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "kirakira-mcp-profile-otel-off-"));
    const traceContext = {
      traceparent: "00-33333333333333333333333333333333-4444444444444444-01",
      tracestate: "vendor=value",
      baggage: "tenant=acme",
    };
    const resolvedConfig = resolvedRuntimeConfig(
      [
        {
          name: "profiled-host",
          mode: "host",
          mcp: { telemetry: { enabled: true, mode: "memory" } },
        },
      ],
      "profiled-host",
    );
    const manager = fakeManager({
      content: [{ type: "text", text: "hello" }],
      isError: false,
    });
    const deps = createDaemonMcpDependencies({
      workspaceRoot,
      mcpManager: manager.manager,
      mcpPep: fakePep(decision("allow")),
      resolvedConfig,
      runtimeProfileName: "profiled-host",
      mcpOtelEnv: { KIRAKIRA_MCP_OTEL_MODE: "off" },
    });
    const runtime = new DaemonMcpRuntime({
      workspaceRoot,
      mcpManager: manager.manager,
      mcpPep: fakePep(decision("allow")),
      resolvedConfig,
      runtimeProfileName: "profiled-host",
      mcpOtelEnv: { KIRAKIRA_MCP_OTEL_MODE: "off" },
    });

    try {
      expect(deps.mcpOtelRecorderPlan).toMatchObject({
        enabled: false,
        mode: "off",
      });
      expect(deps.mcpSpanRecorder).toBeUndefined();

      const result = await runtime.callTool({
        server: "filesystem-core",
        tool: "read_file",
        arguments: { path: "README.md" },
        traceId: "55555555555555555555555555555555",
        traceContext,
      });

      expect(manager.request).toHaveBeenCalledWith("filesystem-core", "tools/list", {
        _meta: traceContext,
      });
      expect(manager.request).toHaveBeenCalledWith("filesystem-core", "tools/call", {
        name: "read_file",
        arguments: { path: "README.md" },
        _meta: traceContext,
      });
      expect(result.otel).toMatchObject({
        spanName: "tools/call read_file",
        traceContext,
        status: "OK",
      });
      expect(result.otel.traceId).toBeUndefined();
      expect(result.otel.spanId).toBeUndefined();
    } finally {
      await runtime.close();
      await deps.close();
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("preserves tool-originated MCP errors with profile memory trace propagation", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "kirakira-mcp-profile-error-"));
    const traceContext = {
      traceparent: "00-66666666666666666666666666666666-7777777777777777-01",
      tracestate: "vendor=state",
      baggage: "tenant=acme,run=run-1",
    };
    const resolvedConfig = resolvedRuntimeConfig(
      [
        {
          name: "profiled-host",
          mode: "host",
          mcp: { telemetry: { enabled: true, mode: "memory" } },
        },
      ],
      "profiled-host",
    );
    const manager = fakeManager({
      content: [{ type: "text", text: "missing required path" }],
      structuredContent: { code: "missing_path" },
      isError: true,
    });
    const runtime = new DaemonMcpRuntime({
      workspaceRoot,
      mcpManager: manager.manager,
      mcpPep: fakePep(decision("allow")),
      resolvedConfig,
      runtimeProfileName: "profiled-host",
      mcpOtelEnv: {},
    });

    try {
      const result = await runtime.callTool({
        server: "filesystem-core",
        tool: "read_file",
        arguments: { path: "" },
        traceContext,
      });

      expect(manager.request).toHaveBeenCalledWith("filesystem-core", "tools/call", {
        name: "read_file",
        arguments: { path: "" },
        _meta: {
          traceparent: expect.stringMatching(
            /^00-66666666666666666666666666666666-[0-9a-f]{16}-01$/,
          ),
          tracestate: "vendor=state",
          baggage: "tenant=acme,run=run-1",
        },
      });
      expect(result).toMatchObject({
        server: "filesystem-core",
        tool: "read_file",
        success: false,
        content: [{ type: "text", text: "missing required path" }],
        structuredContent: { code: "missing_path" },
        isError: true,
        error: "missing required path",
        otel: {
          traceId: "66666666666666666666666666666666",
          parentSpanId: "7777777777777777",
          traceContext: {
            traceparent: expect.stringMatching(
              /^00-66666666666666666666666666666666-[0-9a-f]{16}-01$/,
            ),
            tracestate: "vendor=state",
            baggage: "tenant=acme,run=run-1",
          },
          status: "ERROR",
          attributes: {
            "mcp.method.name": "tools/call",
            "gen_ai.operation.name": "execute_tool",
            "gen_ai.tool.name": "read_file",
            "error.type": "tool_error",
          },
        },
      });
    } finally {
      await runtime.close();
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("exposes OpenTelemetry API recorder plans without inventing an OTLP exporter", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "kirakira-mcp-profile-api-"));
    const resolvedConfig = resolvedRuntimeConfig(
      [
        {
          name: "profiled-host",
          mode: "host",
          mcp: {
            telemetry: {
              enabled: true,
              mode: "opentelemetry-api",
              tracerName: "kirakira.api.daemon.mcp",
            },
          },
        },
      ],
      "profiled-host",
    );
    const noApiManager = fakeManager({ content: [] });
    const missingApiDeps = createDaemonMcpDependencies({
      workspaceRoot,
      mcpManager: noApiManager.manager,
      mcpPep: fakePep(decision("allow")),
      resolvedConfig,
      runtimeProfileName: "profiled-host",
      mcpOtelEnv: {},
    });
    const otelSpan = {
      spanContext: vi.fn(() => ({
        traceId: "88888888888888888888888888888888",
        spanId: "9999999999999999",
      })),
      setAttributes: vi.fn(),
      setStatus: vi.fn(),
      end: vi.fn(),
    };
    const tracer = { startSpan: vi.fn(() => otelSpan) };
    const api: OpenTelemetryApiLike = {
      context: { active: vi.fn(() => ({ active: true })) },
      trace: {
        getTracer: vi.fn(() => tracer),
        setSpan: vi.fn((context, span) => ({ context, span })),
      },
      propagation: { inject: vi.fn() },
    };
    const apiManager = fakeManager({ content: [] });
    const apiDeps = createDaemonMcpDependencies({
      workspaceRoot,
      mcpManager: apiManager.manager,
      mcpPep: fakePep(decision("allow")),
      resolvedConfig,
      runtimeProfileName: "profiled-host",
      mcpOtelEnv: {},
      mcpOtelApi: api,
    });

    try {
      expect(missingApiDeps).toMatchObject({
        mcpOtelRecorderPlan: {
          enabled: true,
          mode: "opentelemetry-api",
          tracerName: "kirakira.api.daemon.mcp",
        },
        mcpOtelRecorderError: expect.stringMatching(/OpenTelemetry MCP recorder plan requires/u),
      });
      expect(missingApiDeps.mcpSpanRecorder).toBeUndefined();
      expect(missingApiDeps.mcpOtelExporter).toBeUndefined();

      expect(apiDeps.mcpOtelRecorderPlan).toMatchObject({
        enabled: true,
        mode: "opentelemetry-api",
        tracerName: "kirakira.api.daemon.mcp",
      });
      expect(apiDeps.mcpSpanRecorder).toBeDefined();
      expect(apiDeps.mcpOtelRecorderError).toBeUndefined();

      const span = apiDeps.mcpSpanRecorder?.startSpan({ name: "tools/list", kind: "CLIENT" });
      span?.end({ status: { code: "OK" }, endTimeUnixMs: 25 });
      expect(api.trace.getTracer).toHaveBeenCalledWith("kirakira.api.daemon.mcp", undefined);
      expect(tracer.startSpan).toHaveBeenCalledWith(
        "tools/list",
        expect.objectContaining({
          kind: 2,
          attributes: expect.objectContaining({
            "service.name": "kirakira-agent",
            "kirakira.runtime.profile": "profiled-host",
          }),
        }),
        expect.anything(),
      );
      expect(otelSpan.setStatus).toHaveBeenCalledWith({ code: 1 });
      expect(otelSpan.end).toHaveBeenCalledWith(25);
    } finally {
      await missingApiDeps.close();
      await apiDeps.close();
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("uses a daemon-hosted OpenTelemetry SDK factory for MCP SDK recorder plans", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "kirakira-mcp-profile-sdk-"));
    const resolvedConfig = resolvedRuntimeConfig(
      [
        {
          name: "profiled-host",
          mode: "host",
          mcp: {
            telemetry: {
              enabled: true,
              mode: "opentelemetry-sdk",
              tracerName: "kirakira.sdk.daemon.mcp",
              exporter: {
                type: "otlp",
                otlp: {
                  tracesEndpoint: "http://127.0.0.1:4318/v1/traces",
                  tracesProtocol: "http/json",
                  tracesTimeoutMs: 2500,
                },
              },
            },
          },
        },
      ],
      "profiled-host",
    );
    const otelSpan = {
      spanContext: vi.fn(() => ({
        traceId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        spanId: "bbbbbbbbbbbbbbbb",
      })),
      setAttributes: vi.fn(),
      setStatus: vi.fn(),
      end: vi.fn(),
    };
    const tracer = { startSpan: vi.fn(() => otelSpan) };
    const api: OpenTelemetryApiLike = {
      context: { active: vi.fn(() => ({ active: true })) },
      trace: {
        getTracer: vi.fn(() => tracer),
        setSpan: vi.fn((context, span) => ({ context, span })),
      },
      propagation: { inject: vi.fn() },
    };
    const shutdown = vi.fn(async () => {});
    const sdkFactory: McpOtelSdkFactory = vi.fn(() => ({ api, shutdown }));
    const manager = fakeManager({ content: [] });
    const deps = createDaemonMcpDependencies({
      workspaceRoot,
      mcpManager: manager.manager,
      mcpPep: fakePep(decision("allow")),
      resolvedConfig,
      runtimeProfileName: "profiled-host",
      mcpOtelSdkFactory: sdkFactory,
    });

    try {
      expect(deps.mcpOtelRecorderPlan).toMatchObject({
        enabled: true,
        mode: "opentelemetry-sdk",
        tracerName: "kirakira.sdk.daemon.mcp",
        sdk: {
          tracesExporter: "otlp",
          otlp: {
            tracesEndpoint: "http://127.0.0.1:4318/v1/traces",
            tracesProtocol: "http/json",
            tracesTimeoutMs: 2500,
          },
        },
      });
      expect(sdkFactory).toHaveBeenCalledWith({
        plan: expect.objectContaining({
          mode: "opentelemetry-sdk",
          tracerName: "kirakira.sdk.daemon.mcp",
        }),
      });
      expect(deps.mcpSpanRecorder).toBeDefined();
      expect(deps.mcpOtelRecorderError).toBeUndefined();

      const span = deps.mcpSpanRecorder?.startSpan({
        name: "tools/list",
        kind: "CLIENT",
        attributes: { "mcp.server.name": "filesystem-core" },
      });
      span?.end({ status: { code: "OK" }, endTimeUnixMs: 50 });
      expect(api.trace.getTracer).toHaveBeenCalledWith("kirakira.sdk.daemon.mcp", undefined);
      expect(tracer.startSpan).toHaveBeenCalledWith(
        "tools/list",
        expect.objectContaining({
          kind: 2,
          attributes: expect.objectContaining({
            "service.name": "kirakira-agent",
            "kirakira.runtime.profile": "profiled-host",
            "mcp.server.name": "filesystem-core",
          }),
        }),
        expect.anything(),
      );
      expect(otelSpan.setStatus).toHaveBeenCalledWith({ code: 1 });
      expect(otelSpan.end).toHaveBeenCalledWith(50);
    } finally {
      await deps.close();
      await rm(workspaceRoot, { recursive: true, force: true });
    }
    expect(shutdown).toHaveBeenCalledTimes(1);
  });

  it("keeps SDK-mode MCP OTel plans diagnosable when the daemon SDK factory is disabled", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "kirakira-mcp-profile-sdk-disabled-"));
    const manager = fakeManager({ content: [] });
    const deps = createDaemonMcpDependencies({
      workspaceRoot,
      mcpManager: manager.manager,
      mcpPep: fakePep(decision("allow")),
      resolvedConfig: resolvedRuntimeConfig(
        [
          {
            name: "profiled-host",
            mode: "host",
            mcp: { telemetry: { enabled: true, mode: "opentelemetry-sdk" } },
          },
        ],
        "profiled-host",
      ),
      runtimeProfileName: "profiled-host",
      mcpOtelSdkFactory: null,
    });

    try {
      expect(deps.mcpOtelRecorderPlan).toMatchObject({
        enabled: true,
        mode: "opentelemetry-sdk",
      });
      expect(deps.mcpOtelRecorderError).toMatch(
        /requires an injected OpenTelemetry SDK\/OTLP exporter factory/u,
      );
      expect(deps.mcpSpanRecorder).toBeUndefined();
      expect(deps.mcpOtelShutdown).toBeUndefined();
    } finally {
      await deps.close();
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("enforces MCP PEP, starts the target server, and returns a typed tool result", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "kirakira-mcp-runtime-"));
    const manager = fakeManager({
      content: [{ type: "text", text: "hello" }],
      structuredContent: { ok: true },
      isError: false,
    });
    const pep = fakePep(decision("allow"));
    const runtime = new DaemonMcpRuntime({
      workspaceRoot,
      mcpManager: manager.manager,
      mcpPep: pep,
    });

    try {
      const result = await runtime.callTool({
        server: "filesystem-core",
        tool: "read_file",
        arguments: { path: "README.md" },
        runId: "run-1",
        traceId: "trace-1",
        subagentId: "sub-implementer-1",
        role: "implementer",
        requestedLane: "delegated",
      });

      expect(pep.enforce).toHaveBeenCalledWith(
        expect.objectContaining({
          mcpServer: "filesystem-core",
          toolName: "read_file",
          args: ["README.md"],
          env: {
            MCP_TRUST: "unknown",
            KIRAKIRA_MCP_TRUST: "unknown",
            KIRAKIRA_TRUST_TIER: "unknown",
          },
        }),
        expect.objectContaining({
          sessionId: "run-1",
          traceId: "trace-1",
          workspaceRoot,
          agent: {
            subagentId: "sub-implementer-1",
            role: "implementer",
            lane: "delegated",
            requestedLane: "delegated",
          },
        }),
      );
      expect(manager.startServer).toHaveBeenCalledWith("filesystem-core");
      expect(manager.request).toHaveBeenCalledWith("filesystem-core", "tools/call", {
        name: "read_file",
        arguments: { path: "README.md" },
      });
      expect(result).toMatchObject({
        server: "filesystem-core",
        tool: "read_file",
        success: true,
        content: [{ type: "text", text: "hello" }],
        structuredContent: { ok: true },
        isError: false,
        policy: {
          effect: "allow",
          reasonCodes: ["baseline_read_workspace"],
          approvalRequired: false,
          traceId: "trace-1",
        },
      });
    } finally {
      await runtime.close();
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("normalizes unknown MCP servers without starting dependencies", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "kirakira-mcp-runtime-unknown-server-"));
    const manager = fakeManager({ content: [] });
    const pep = fakePep(decision("allow"));
    const runtime = new DaemonMcpRuntime({
      workspaceRoot,
      mcpManager: manager.manager,
      mcpPep: pep,
    });

    try {
      const result = await runtime.callTool({
        server: "missing-server",
        tool: "read_file",
        arguments: { path: "README.md" },
        traceId: "trace-unknown-server",
      });

      expect(pep.enforce).not.toHaveBeenCalled();
      expect(manager.startServer).not.toHaveBeenCalled();
      expect(manager.request).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        server: "missing-server",
        tool: "read_file",
        success: false,
        isError: true,
        error: "Unknown MCP server: missing-server",
        structuredContent: {
          error: {
            type: "server_not_found",
            jsonrpc: {
              code: -32602,
              message: "Unknown MCP server: missing-server",
              data: { server: "missing-server" },
            },
          },
        },
        policy: {
          effect: "deny",
          reasonCodes: ["mcp_server_not_found"],
          approvalRequired: false,
          traceId: "trace-unknown-server",
        },
        otel: {
          status: "ERROR",
          attributes: {
            "error.type": "server_not_found",
            "rpc.response.status_code": "-32602",
          },
        },
      });
    } finally {
      await runtime.close();
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("resolves tools before execution and returns JSON-RPC-style errors for unknown tools", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "kirakira-mcp-runtime-unknown-tool-"));
    const manager = fakeManager({ content: [] }, {
      tools: [
        {
          name: "read_file",
          inputSchema: { type: "object", properties: { path: { type: "string" } } },
        },
      ],
    });
    const runtime = new DaemonMcpRuntime({
      workspaceRoot,
      mcpManager: manager.manager,
      mcpPep: fakePep(decision("allow")),
    });

    try {
      const result = await runtime.callTool({
        server: "filesystem-core",
        tool: "write_file",
        arguments: { path: "README.md", content: "x" },
      });

      expect(manager.startServer).toHaveBeenCalledWith("filesystem-core");
      expect(manager.request).toHaveBeenCalledWith("filesystem-core", "tools/list", {});
      expect(manager.request.mock.calls.some(([, method]) => method === "tools/call")).toBe(false);
      expect(result).toMatchObject({
        server: "filesystem-core",
        tool: "write_file",
        success: false,
        isError: true,
        error: "Unknown MCP tool: filesystem-core:write_file",
        structuredContent: {
          error: {
            type: "tool_not_found",
            jsonrpc: {
              code: -32602,
              message: "Unknown MCP tool: filesystem-core:write_file",
              data: { server: "filesystem-core", tool: "write_file" },
            },
          },
        },
        policy: {
          effect: "allow",
          reasonCodes: ["baseline_read_workspace"],
        },
        otel: {
          status: "ERROR",
          attributes: {
            "error.type": "tool_not_found",
            "rpc.response.status_code": "-32602",
          },
        },
      });
    } finally {
      await runtime.close();
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("normalizes MCP adapter execution errors after tool resolution", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "kirakira-mcp-runtime-adapter-error-"));
    const manager = fakeManager({ content: [] }, {
      callError: new Error("adapter exploded"),
      tools: [{ name: "read_file", inputSchema: { type: "object" } }],
    });
    const runtime = new DaemonMcpRuntime({
      workspaceRoot,
      mcpManager: manager.manager,
      mcpPep: fakePep(decision("allow")),
    });

    try {
      const result = await runtime.callTool({
        server: "filesystem-core",
        tool: "read_file",
        arguments: { path: "README.md" },
      });

      expect(manager.request.mock.calls.map(([, method]) => method)).toEqual([
        "tools/list",
        "tools/call",
      ]);
      expect(result).toMatchObject({
        server: "filesystem-core",
        tool: "read_file",
        success: false,
        isError: true,
        error: "adapter exploded",
        structuredContent: {
          error: {
            type: "adapter_error",
            jsonrpc: {
              code: -32603,
              message: "adapter exploded",
            },
          },
        },
        otel: {
          status: "ERROR",
          attributes: {
            "error.type": "adapter_error",
            "rpc.response.status_code": "-32603",
          },
        },
      });
    } finally {
      await runtime.close();
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("rejects non-object tools/call arguments at the runtime bridge boundary", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "kirakira-mcp-runtime-bad-args-"));
    const manager = fakeManager({ content: [] });
    const pep = fakePep(decision("allow"));
    const runtime = new DaemonMcpRuntime({
      workspaceRoot,
      mcpManager: manager.manager,
      mcpPep: pep,
    });

    try {
      const result = await runtime.callTool({
        server: "filesystem-core",
        tool: "read_file",
        arguments: ["README.md"] as unknown as Record<string, unknown>,
      });

      expect(pep.enforce).not.toHaveBeenCalled();
      expect(manager.startServer).not.toHaveBeenCalled();
      expect(manager.request).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        server: "filesystem-core",
        tool: "read_file",
        success: false,
        isError: true,
        error: "MCP tools/call arguments must be a JSON object",
        structuredContent: {
          error: {
            type: "invalid_params",
            jsonrpc: {
              code: -32602,
              message: "MCP tools/call arguments must be a JSON object",
              data: { server: "filesystem-core", tool: "read_file" },
            },
          },
        },
        policy: {
          effect: "deny",
          reasonCodes: ["mcp_invalid_params"],
        },
        otel: {
          status: "ERROR",
          attributes: {
            "error.type": "invalid_params",
            "rpc.response.status_code": "-32602",
          },
        },
      });
    } finally {
      await runtime.close();
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("lists live MCP server health and tools on demand", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "kirakira-mcp-runtime-list-"));
    const manager = fakeManager({
      tools: [
        {
          name: "read_file",
          title: "Read file",
          description: "Read file content",
          inputSchema: { type: "object", properties: { path: { type: "string" } } },
          outputSchema: { type: "object" },
          annotations: { readOnlyHint: true },
          execution: { taskSupport: "optional" },
        },
      ],
    });
    const runtime = new DaemonMcpRuntime({
      workspaceRoot,
      mcpManager: manager.manager,
      mcpPep: fakePep(decision("allow")),
    });

    try {
      const result = await runtime.listTools({
        server: "filesystem-core",
        includeTools: true,
        startServers: true,
      });

      expect(manager.startServer).toHaveBeenCalledWith("filesystem-core");
      expect(manager.request).toHaveBeenCalledWith("filesystem-core", "tools/list", {});
      expect(result.servers).toHaveLength(1);
      expect(result.servers[0]).toMatchObject({
        name: "filesystem-core",
        health: "healthy",
        toolCount: 1,
        trust: {
          tier: "unknown",
          source: "first-use",
          trustedAnnotations: false,
          configuredLevel: "untrusted",
          transportKind: "stdio",
          authMode: "none",
        },
        policy: {
          decision: "not_evaluated",
          source: "not-evaluated",
        },
        audit: {
          auditRequired: false,
          eventKinds: ["mcp.discovery"],
          ledger: "none",
        },
      });
      expect(result.servers[0]?.tools?.[0]).toMatchObject({
        name: "read_file",
        title: "Read file",
        description: "Read file content",
        inputSchema: { type: "object", properties: { path: { type: "string" } } },
        outputSchema: { type: "object" },
        annotations: { readOnlyHint: true },
        execution: { taskSupport: "optional" },
        trust: {
          tier: "unknown",
          source: "first-use",
          trustedAnnotations: false,
        },
        policy: {
          decision: "ask",
          source: "gateway-default",
          reasonCodes: ["mcp_gateway_default_ask"],
          approvalRequired: true,
        },
        audit: {
          auditRequired: false,
          eventKinds: ["mcp.discovery"],
          ledger: "none",
        },
        otel: {
          spanName: "tools/list read_file",
          attributes: {
            "mcp.method.name": "tools/list",
            "mcp.server.name": "filesystem-core",
            "gen_ai.tool.name": "read_file",
            "mcp.trust.tier": "unknown",
          },
        },
      });
    } finally {
      await runtime.close();
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("records exported spans and propagates trace metadata for mcp_list", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "kirakira-mcp-runtime-list-span-"));
    const traceId = "0123456789abcdef0123456789abcdef";
    const exporter = new InMemoryMcpSpanExporter();
    const manager = fakeManager({
      tools: [
        {
          name: "read_file",
          description: "Read file content",
          inputSchema: { type: "object" },
        },
      ],
    });
    const runtime = new DaemonMcpRuntime({
      workspaceRoot,
      mcpManager: manager.manager,
      mcpPep: fakePep(decision("allow")),
      mcpSpanRecorder: new ExportingMcpSpanRecorder(exporter),
    });

    try {
      const result = await runtime.listTools({
        server: "filesystem-core",
        includeTools: true,
        startServers: true,
        traceId,
      });

      expect(manager.request).toHaveBeenCalledWith("filesystem-core", "tools/list", {
        _meta: {
          traceparent: expect.stringMatching(
            /^00-0123456789abcdef0123456789abcdef-[0-9a-f]{16}-01$/,
          ),
        },
      });
      expect(exporter.spans).toHaveLength(1);
      expect(exporter.spans[0]).toMatchObject({
        name: "tools/list",
        kind: "CLIENT",
        context: { traceId },
        attributes: {
          "mcp.method.name": "tools/list",
          "mcp.server.name": "filesystem-core",
          "kirakira.runtime.message.type": "mcp_list",
        },
        status: { code: "OK" },
      });
      expect(result.servers[0]?.otel).toMatchObject({
        spanName: "tools/list",
        traceId,
        spanId: expect.stringMatching(/^[0-9a-f]{16}$/),
        status: "OK",
      });
    } finally {
      await runtime.close();
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("records exported spans and propagates trace metadata for mcp_call", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "kirakira-mcp-runtime-call-span-"));
    const traceId = "abcdef0123456789abcdef0123456789";
    const exporter = new InMemoryMcpSpanExporter();
    const manager = fakeManager({
      content: [{ type: "text", text: "hello" }],
      isError: false,
    });
    const runtime = new DaemonMcpRuntime({
      workspaceRoot,
      mcpManager: manager.manager,
      mcpPep: fakePep(decision("allow")),
      mcpSpanRecorder: new ExportingMcpSpanRecorder(exporter),
    });

    try {
      const result = await runtime.callTool({
        server: "filesystem-core",
        tool: "read_file",
        arguments: { path: "README.md" },
        runId: "run-1",
        traceId,
      });

      expect(manager.request).toHaveBeenCalledWith("filesystem-core", "tools/call", {
        name: "read_file",
        arguments: { path: "README.md" },
        _meta: {
          traceparent: expect.stringMatching(
            /^00-abcdef0123456789abcdef0123456789-[0-9a-f]{16}-01$/,
          ),
        },
      });
      expect(exporter.spans).toHaveLength(1);
      expect(exporter.spans[0]).toMatchObject({
        name: "tools/call read_file",
        kind: "CLIENT",
        context: { traceId },
        attributes: {
          "mcp.method.name": "tools/call",
          "mcp.server.name": "filesystem-core",
          "gen_ai.operation.name": "execute_tool",
          "gen_ai.tool.name": "read_file",
          "kirakira.runtime.message.type": "mcp_call",
          "kirakira.run.id": "run-1",
          "kirakira.policy.trace_id": "trace-1",
        },
        status: { code: "OK" },
      });
      expect(result.otel).toMatchObject({
        spanName: "tools/call read_file",
        traceId,
        spanId: expect.stringMatching(/^[0-9a-f]{16}$/),
        status: "OK",
        attributes: {
          "mcp.method.name": "tools/call",
          "gen_ai.operation.name": "execute_tool",
          "gen_ai.tool.name": "read_file",
        },
      });
    } finally {
      await runtime.close();
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("passes W3C trace context through MCP _meta without a span recorder", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "kirakira-mcp-runtime-pass-through-"));
    const traceContext = {
      traceparent: "00-11111111111111111111111111111111-2222222222222222-01",
      tracestate: "rojo=2222222222222222,congo=t61rcWkgMzE",
      baggage: "tenant=acme,run=run-1",
    };
    const manager = fakeManager({
      content: [{ type: "text", text: "hello" }],
      isError: false,
    });
    const runtime = new DaemonMcpRuntime({
      workspaceRoot,
      mcpManager: manager.manager,
      mcpPep: fakePep(decision("allow")),
      mcpSpanRecorder: null,
    });

    try {
      const result = await runtime.callTool({
        server: "filesystem-core",
        tool: "read_file",
        arguments: { path: "README.md" },
        runId: "run-1",
        traceContext,
      });

      expect(manager.request).toHaveBeenCalledWith("filesystem-core", "tools/call", {
        name: "read_file",
        arguments: { path: "README.md" },
        _meta: traceContext,
      });
      expect(result.otel).toMatchObject({
        spanName: "tools/call read_file",
        traceContext,
        status: "OK",
      });
    } finally {
      await runtime.close();
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("returns policy denials as tool-call results without starting MCP servers", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "kirakira-mcp-runtime-deny-"));
    const manager = fakeManager({ content: [] });
    const runtime = new DaemonMcpRuntime({
      workspaceRoot,
      mcpManager: manager.manager,
      mcpPep: fakePep(decision("deny")),
    });

    try {
      const result = await runtime.callTool({
        server: "filesystem-core",
        tool: "write_file",
        arguments: { path: "README.md", content: "x" },
      });

      expect(manager.startServer).not.toHaveBeenCalled();
      expect(manager.request).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        server: "filesystem-core",
        tool: "write_file",
        success: false,
        isError: true,
        error: "policy_denied",
        policy: {
          effect: "deny",
          reasonCodes: ["policy_denied"],
          approvalRequired: false,
          traceId: "trace-1",
        },
      });
    } finally {
      await runtime.close();
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("routes direct calls through shared gateway trust and audit context", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "kirakira-mcp-runtime-context-"));
    const manager = fakeManager(
      {
        content: [{ type: "text", text: "docs" }],
        isError: false,
      },
      {
        serverName: "docs",
        transport: { kind: "http", url: "https://mcp.example.test" },
        auth: { mode: "bearer", clientSecretEnv: "DOCS_MCP_TOKEN" },
        trust: "user-approved",
        tools: [{ name: "search", inputSchema: { type: "object" } }],
      },
    );
    const pep = fakePep(decision("allow"));
    const auditBridge = {
      recordConnection: vi.fn(async () => {}),
      recordToolCall: vi.fn(async () => {}),
    } as unknown as McpAuditBridge;
    const runtime = new DaemonMcpRuntime({
      workspaceRoot,
      mcpManager: manager.manager,
      mcpPep: pep,
      mcpAuditBridge: auditBridge,
      userId: "developer-1",
    });

    try {
      const result = await runtime.callTool({
        server: "docs",
        tool: "search",
        arguments: { query: "MCP annotations" },
        runId: "run-docs",
      });

      expect(pep.enforce).toHaveBeenCalledWith(
        expect.objectContaining({
          mcpServer: "docs",
          serverId: "docs",
          issuer: "mcp.example.test",
          toolName: "search",
          env: {
            MCP_TRUST: "verified",
            KIRAKIRA_MCP_TRUST: "verified",
            KIRAKIRA_TRUST_TIER: "verified",
          },
        }),
        expect.objectContaining({
          sessionId: "run-docs",
          userId: "developer-1",
        }),
      );
      expect(auditBridge.recordConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          serverId: "docs",
          trustTier: "verified",
          transport: "http",
          status: "connected",
          userId: "developer-1",
          sessionId: "run-docs",
        }),
      );
      expect(auditBridge.recordToolCall).toHaveBeenCalledWith(
        expect.objectContaining({
          serverId: "docs",
          toolName: "search",
          trustTier: "verified",
          authMode: "bearer",
          decisionId: "decision-1",
          status: "success",
        }),
      );
      expect(result).toMatchObject({
        server: "docs",
        tool: "search",
        success: true,
        trust: {
          tier: "verified",
          source: "config",
          trustedAnnotations: true,
          configuredLevel: "user-approved",
          issuer: "mcp.example.test",
        },
        audit: {
          auditRequired: true,
          ledger: "mcp-audit-bridge",
          decisionId: "decision-1",
        },
        otel: {
          attributes: {
            "mcp.server.name": "docs",
            "gen_ai.tool.name": "search",
            "mcp.trust.tier": "verified",
          },
        },
      });
    } finally {
      await runtime.close();
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("smoke-tests trace, audit, and policy propagation across daemon-owned MCP transports", async () => {
    const cases: Array<{
      label: string;
      server: string;
      tool: string;
      traceId: string;
      parentSpanId: string;
      transport: McpTransport;
      auth: McpAuth;
      trust: McpServerConfig["trust"];
      expectedTrust: Record<string, unknown>;
      expectedOtelAttributes: Record<string, unknown>;
      expectedConnectionTransport: string;
      expectedConnectionTrustTier: string;
    }> = [
      {
        label: "stdio",
        server: "filesystem-core",
        tool: "read_file",
        traceId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        parentSpanId: "1111111111111111",
        transport: { kind: "stdio", command: "node", args: ["server.js"] },
        auth: { mode: "none" },
        trust: "untrusted",
        expectedTrust: {
          tier: "unknown",
          source: "first-use",
          trustedAnnotations: false,
          configuredLevel: "untrusted",
          transportKind: "stdio",
          authMode: "none",
        },
        expectedOtelAttributes: {
          "mcp.transport.kind": "stdio",
          "network.transport": "pipe",
          "mcp.auth.mode": "none",
        },
        expectedConnectionTransport: "stdio",
        expectedConnectionTrustTier: "community",
      },
      {
        label: "http",
        server: "docs",
        tool: "search",
        traceId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        parentSpanId: "2222222222222222",
        transport: { kind: "http", url: "https://mcp.example.test/mcp" },
        auth: { mode: "bearer", clientSecretEnv: "DOCS_MCP_TOKEN" },
        trust: "user-approved",
        expectedTrust: {
          tier: "verified",
          source: "config",
          trustedAnnotations: true,
          configuredLevel: "user-approved",
          transportKind: "http",
          authMode: "bearer",
          serverUrl: "https://mcp.example.test/mcp",
          issuer: "mcp.example.test",
        },
        expectedOtelAttributes: {
          "mcp.transport.kind": "http",
          "network.transport": "tcp",
          "network.protocol.name": "http",
          "mcp.auth.mode": "bearer",
        },
        expectedConnectionTransport: "http",
        expectedConnectionTrustTier: "verified",
      },
    ];

    for (const testCase of cases) {
      const workspaceRoot = await mkdtemp(
        join(tmpdir(), `kirakira-mcp-runtime-propagation-${testCase.label}-`),
      );
      const traceContext = {
        traceparent: `00-${testCase.traceId}-${testCase.parentSpanId}-01`,
        tracestate: `case=${testCase.label}`,
        baggage: `transport=${testCase.label},run=run-${testCase.label}`,
      };
      const policy = decision("allow");
      policy.traceId = `policy-trace-${testCase.label}`;
      policy.decision.decision_id = `decision-${testCase.label}`;
      policy.decision.reason_codes = [`allow_${testCase.label}`];
      const exporter = new InMemoryMcpSpanExporter();
      const manager = fakeManager(
        {
          content: [{ type: "text", text: `ok:${testCase.label}` }],
          structuredContent: { transport: testCase.label },
          isError: false,
        },
        {
          serverName: testCase.server,
          transport: testCase.transport,
          auth: testCase.auth,
          trust: testCase.trust,
          tools: [{ name: testCase.tool, inputSchema: { type: "object" } }],
        },
      );
      const auditBridge = {
        recordConnection: vi.fn(async () => {}),
        recordToolCall: vi.fn(async () => {}),
      } as unknown as McpAuditBridge;
      const runtime = new DaemonMcpRuntime({
        workspaceRoot,
        mcpManager: manager.manager,
        mcpPep: fakePep(policy),
        mcpAuditBridge: auditBridge,
        mcpSpanRecorder: new ExportingMcpSpanRecorder(exporter),
        userId: "developer-1",
      });

      try {
        const result = await runtime.callTool({
          server: testCase.server,
          tool: testCase.tool,
          arguments: { query: "metadata propagation" },
          runId: `run-${testCase.label}`,
          traceId: testCase.traceId,
          traceContext,
        });

        const expectedMeta = {
          traceparent: expect.stringMatching(
            new RegExp(`^00-${testCase.traceId}-[0-9a-f]{16}-01$`),
          ),
          tracestate: traceContext.tracestate,
          baggage: traceContext.baggage,
        };
        const listCall = manager.request.mock.calls.find(
          ([, method]) => method === "tools/list",
        );
        const toolCall = manager.request.mock.calls.find(
          ([, method]) => method === "tools/call",
        );

        expect(listCall?.[2]).toMatchObject({ _meta: expectedMeta });
        expect(toolCall?.[2]).toMatchObject({
          name: testCase.tool,
          arguments: { query: "metadata propagation" },
          _meta: expectedMeta,
        });
        expect(auditBridge.recordConnection).toHaveBeenCalledWith(
          expect.objectContaining({
            serverId: testCase.server,
            trustTier: testCase.expectedConnectionTrustTier,
            transport: testCase.expectedConnectionTransport,
            status: "connected",
            userId: "developer-1",
            sessionId: `run-${testCase.label}`,
            traceId: testCase.traceId,
          }),
        );
        expect(auditBridge.recordToolCall).toHaveBeenCalledWith(
          expect.objectContaining({
            serverId: testCase.server,
            toolName: testCase.tool,
            trustTier: testCase.expectedTrust.tier,
            authMode: testCase.expectedTrust.authMode,
            decisionId: `decision-${testCase.label}`,
            status: "success",
            traceId: `policy-trace-${testCase.label}`,
          }),
        );
        expect(exporter.spans).toHaveLength(1);
        expect(exporter.spans[0]).toMatchObject({
          name: `tools/call ${testCase.tool}`,
          kind: "CLIENT",
          context: {
            traceId: testCase.traceId,
            parentSpanId: testCase.parentSpanId,
          },
          attributes: {
            "mcp.method.name": "tools/call",
            "mcp.server.name": testCase.server,
            "gen_ai.operation.name": "execute_tool",
            "gen_ai.tool.name": testCase.tool,
            "kirakira.runtime.message.type": "mcp_call",
            "kirakira.policy.trace_id": `policy-trace-${testCase.label}`,
            "kirakira.policy.decision_id": `decision-${testCase.label}`,
            ...testCase.expectedOtelAttributes,
          },
          status: { code: "OK" },
        });
        expect(result).toMatchObject({
          server: testCase.server,
          tool: testCase.tool,
          success: true,
          structuredContent: { transport: testCase.label },
          policy: {
            effect: "allow",
            reasonCodes: [`allow_${testCase.label}`],
            approvalRequired: false,
            traceId: `policy-trace-${testCase.label}`,
            decisionId: `decision-${testCase.label}`,
          },
          trust: testCase.expectedTrust,
          audit: {
            auditRequired: true,
            eventKinds: ["policy.decision", "tool.exec", "tool.result"],
            ledger: "mcp-audit-bridge",
            decisionId: `decision-${testCase.label}`,
          },
          otel: {
            spanName: `tools/call ${testCase.tool}`,
            traceId: testCase.traceId,
            parentSpanId: testCase.parentSpanId,
            traceContext: expectedMeta,
            status: "OK",
            attributes: {
              "mcp.method.name": "tools/call",
              "mcp.protocol.version": "2025-11-25",
              "mcp.server.name": testCase.server,
              "gen_ai.operation.name": "execute_tool",
              "gen_ai.tool.name": testCase.tool,
              "kirakira.policy.trace_id": `policy-trace-${testCase.label}`,
              "kirakira.policy.decision_id": `decision-${testCase.label}`,
              ...testCase.expectedOtelAttributes,
            },
          },
        });
        expect(result.otel.traceContext?.traceparent).not.toBe(traceContext.traceparent);
      } finally {
        await runtime.close();
        await rm(workspaceRoot, { recursive: true, force: true });
      }
    }
  });
});
