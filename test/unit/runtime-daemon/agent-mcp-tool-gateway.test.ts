import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { McpServerConfig, McpTransport } from "@kirakira/core";
import type { McpClientManager } from "@kirakira/mcp-adapter";
import type { EnforcementResult, McpPep } from "@kirakira/policy-engine";
import type { RunEvent } from "@kirakira/runtime-contracts";
import { describe, expect, it, vi } from "vitest";
import {
  ToolExecutor,
  type ReactWorkerConfig,
} from "../../../packages/agent-runtime/src/index.js";
import {
  createDaemonAgentMcpToolGateway,
  type DaemonMcpGatewayCallInput,
} from "../../../packages/runtime-daemon/src/bridge/agent-mcp-tool-gateway.js";
import {
  createDaemonDelegateRuntime,
} from "../../../packages/runtime-daemon/src/bridge/runtime-deps.js";

function decision(effect: "allow" | "deny" | "escalate"): EnforcementResult {
  return {
    allowed: effect === "allow",
    traceId: "policy-trace-1",
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

function parentConfig(runId = "run-1"): ReactWorkerConfig {
  return {
    id: "worker-parent",
    runId,
    workloadType: "supervisor",
    model: "test-model",
    systemPrompt: "system",
    contextBudget: {
      maxTokens: 4096,
      reservedForOutput: 512,
      toolSchemaAllocation: 512,
      skillHintAllocation: 512,
      historyAllocation: 2048,
    },
    maxTurns: 4,
  };
}

function fakeManager(
  rawResult: unknown,
  options: {
    serverName?: string;
    transport?: McpTransport;
    trust?: McpServerConfig["trust"];
    tools?: Array<Record<string, unknown>>;
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
    auth: { mode: "none" },
    trust: options.trust ?? "untrusted",
  };
  const listResult = {
    tools: options.tools ?? [
      {
        name: "read_file",
        description: "Read file content",
        inputSchema: { type: "object", properties: { path: { type: "string" } } },
      },
    ],
  };
  const request = vi.fn(async (_name: string, method: string) => {
    if (method === "tools/list") return listResult;
    if (method === "tools/call") return rawResult;
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

describe("DaemonAgentMcpToolGateway", () => {
  it("adapts ToolExecutor gateway requests with profile and trace context", async () => {
    const calls: DaemonMcpGatewayCallInput[] = [];
    const traceContext = {
      traceparent: "00-11111111111111111111111111111111-2222222222222222-01",
      baggage: "tenant=acme",
    };
    const gateway = createDaemonAgentMcpToolGateway({
      async callTool(input) {
        calls.push(input);
        return {
          server: input.server,
          tool: input.tool,
          success: true,
          content: [{ type: "text", text: "hello" }],
          latencyMs: 3,
          policy: {
            effect: "allow",
            reasonCodes: ["gateway_allow"],
            approvalRequired: false,
            traceId: "policy-trace-1",
          },
          otel: {
            spanName: "tools/call read_file",
            attributes: {
              "mcp.method.name": "tools/call",
              "gen_ai.operation.name": "execute_tool",
              "gen_ai.tool.name": "read_file",
            },
            traceContext,
            status: "OK",
          },
        };
      },
    });
    const events: RunEvent[] = [];
    const executor = new ToolExecutor(gateway, {
      pepContext: {
        sessionId: "run-1",
        traceId: "trace-1",
        userId: "user-1",
        workspaceRoot: "C:/workspace",
        interactive: false,
        roles: [],
        agent: {
          subagentId: "sub-1",
          role: "implementer",
          requestedLane: "delegated",
        },
      },
      runtimeProfileName: "workbench-host",
      traceContext,
      async onEvent(event) {
        events.push(event);
      },
    });

    const result = await executor.execute("filesystem-core:read_file", {
      path: "README.md",
    });

    expect(calls).toEqual([
      {
        server: "filesystem-core",
        tool: "read_file",
        arguments: { path: "README.md" },
        runId: "run-1",
        traceId: "trace-1",
        traceContext,
        subagentId: "sub-1",
        role: "implementer",
        requestedLane: "delegated",
        runtimeProfileName: "workbench-host",
      },
    ]);
    expect(result).toMatchObject({
      success: true,
      output: "hello",
      mcp: {
        server: "filesystem-core",
        tool: "read_file",
        otel: {
          spanName: "tools/call read_file",
          traceContext,
          attributes: {
            "gen_ai.operation.name": "execute_tool",
            "gen_ai.tool.name": "read_file",
          },
        },
      },
    });
    expect(events).toContainEqual(
      expect.objectContaining({
        kind: "tool.call.started",
        payload: expect.objectContaining({
          nativeTool: "read_file",
          runtimeProfileName: "workbench-host",
        }),
      }),
    );
  });

  it("preserves tool-originated MCP isError through the daemon gateway", async () => {
    const gateway = createDaemonAgentMcpToolGateway({
      async callTool(input) {
        return {
          server: input.server,
          tool: input.tool,
          success: false,
          content: [{ type: "text", text: "missing required path" }],
          structuredContent: { code: "missing_path" },
          isError: true,
          error: "missing required path",
          latencyMs: 4,
          policy: {
            effect: "allow",
            reasonCodes: ["baseline_read_workspace"],
            approvalRequired: false,
            traceId: "policy-trace-1",
          },
          otel: {
            spanName: "tools/call read_file",
            attributes: {
              "mcp.method.name": "tools/call",
              "gen_ai.operation.name": "execute_tool",
              "gen_ai.tool.name": "read_file",
              "error.type": "tool_error",
            },
            status: "ERROR",
          },
        };
      },
    });
    const executor = new ToolExecutor(gateway, {
      pepContext: {
        sessionId: "run-1",
        traceId: "trace-1",
        userId: "user-1",
        workspaceRoot: "C:/workspace",
        interactive: false,
        roles: [],
      },
    });

    const result = await executor.execute("filesystem-core:read_file", {});

    expect(result).toMatchObject({
      success: false,
      error: "missing required path",
      output: "missing required path\n\nstructuredContent:\n{\"code\":\"missing_path\"}",
      mcp: {
        server: "filesystem-core",
        tool: "read_file",
        isError: true,
        structuredContent: { code: "missing_path" },
        otel: {
          status: "ERROR",
          attributes: {
            "gen_ai.operation.name": "execute_tool",
            "gen_ai.tool.name": "read_file",
            "error.type": "tool_error",
          },
        },
      },
    });
  });
});

describe("createDaemonDelegateRuntime MCP gateway wiring", () => {
  it("runs delegated ToolExecutor calls through the daemon/profile MCP runtime path", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "kirakira-daemon-agent-gateway-"));
    const traceContext = {
      traceparent: "00-abcdef0123456789abcdef0123456789-0123456789abcdef-01",
      tracestate: "vendor=state",
    };
    const manager = fakeManager(
      {
        content: [{ type: "text", text: "missing required path" }],
        structuredContent: { code: "missing_path" },
        isError: true,
      },
      {
        trust: "user-approved",
        tools: [
          {
            name: "read_file",
            description: "Read file content",
            inputSchema: { type: "object", properties: { path: { type: "string" } } },
          },
        ],
      },
    );
    const emitted: RunEvent[] = [];
    const modelSteps = [
      {
        kind: "tool_call",
        toolName: "filesystem-core:read_file",
        args: { path: "" },
      },
      {
        kind: "final_output",
        output: "handled tool error",
      },
    ];
    const runtime = await createDaemonDelegateRuntime({
      workspaceRoot,
      runtimeProfileName: "workbench-host",
      mcpManager: manager.manager,
      mcpPep: fakePep(decision("allow")),
      traceContext,
      eventWriter: {
        async emit(event) {
          emitted.push(event);
        },
      },
      modelGateway: {
        async complete() {
          const step = modelSteps.shift();
          if (step === undefined) {
            return {
              text: JSON.stringify({ kind: "final_output", output: "done" }),
              model: "test-model",
            };
          }
          return {
            text: JSON.stringify(step),
            model: "test-model",
          };
        },
      },
    });

    try {
      const result = await runtime.delegateRunner({
        subagentId: "sub-1",
        parentWorkerId: "worker-parent",
        parentConfig: parentConfig(),
        runId: "run-1",
        traceId: "trace-1",
        role: "implementer",
        requestedLane: "delegated",
        task: "read a file",
        capabilities: [
          { kind: "tool", name: "filesystem-core:read_file" },
          { kind: "mcp", name: "filesystem-core" },
        ],
        action: {
          kind: "delegate",
          args: { task: "read a file" },
        },
      });

      expect(result).toMatchObject({
        success: true,
        finalText: "handled tool error",
      });
      expect(manager.startServer).toHaveBeenCalledWith("filesystem-core");
      expect(manager.request).toHaveBeenCalledWith("filesystem-core", "tools/call", {
        name: "read_file",
        arguments: { path: "" },
        _meta: traceContext,
      });
      expect(emitted).toContainEqual(
        expect.objectContaining({
          kind: "tool.call.started",
          payload: expect.objectContaining({
            toolName: "filesystem-core:read_file",
            nativeTool: "read_file",
            runtimeProfileName: "workbench-host",
          }),
        }),
      );
      expect(emitted).toContainEqual(
        expect.objectContaining({
          kind: "tool.call.failed",
          payload: expect.objectContaining({
            toolName: "filesystem-core:read_file",
            nativeTool: "read_file",
            isError: true,
            error: "missing required path",
            otel: expect.objectContaining({
              spanName: "tools/call read_file",
              status: "ERROR",
              attributes: expect.objectContaining({
                "mcp.method.name": "tools/call",
                "gen_ai.operation.name": "execute_tool",
                "gen_ai.tool.name": "read_file",
                "error.type": "tool_error",
              }),
            }),
          }),
        }),
      );
    } finally {
      await runtime.close();
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});
