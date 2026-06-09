import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { McpAuth, McpServerConfig, McpTransport } from "@kirakira/core";
import {
  ExportingMcpSpanRecorder,
  InMemoryMcpSpanExporter,
  type McpAuditBridge,
  type McpClientManager,
} from "@kirakira/mcp-adapter";
import type { EnforcementResult, McpPep } from "@kirakira/policy-engine";
import { describe, expect, it, vi } from "vitest";
import {
  DaemonMcpRuntime,
  createDaemonMcpDependencies,
} from "../../../packages/runtime-daemon/src/index.js";

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
  const request = vi.fn(async () => rawResult);
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

describe("DaemonMcpRuntime", () => {
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
});
