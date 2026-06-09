import { describe, expect, it } from "vitest";
import type { RunEvent } from "../../../packages/event-store/src/index.js";
import { ToolExecutor } from "../../../packages/agent-runtime/src/tools/tool-executor.js";
import { handleToolResult } from "../../../packages/agent-runtime/src/tools/tool-result-handler.js";
import type {
  AgentMcpToolCallRequest,
  AgentMcpToolGateway,
  Workspace,
} from "../../../packages/agent-runtime/src/index.js";

function executor(scope = { toolNames: ["filesystem:read_file"], mcpServers: [] as string[] }) {
  const events: RunEvent[] = [];
  let pepCalls = 0;
  let mcpCalls = 0;
  const toolExecutor = new ToolExecutor(
    {
      async enforce() {
        pepCalls += 1;
        return {
          allowed: true,
          decision: { effect: "allow" },
          traceId: "trace-1",
        };
      },
    } as unknown as ConstructorParameters<typeof ToolExecutor>[0],
    {
      async request(_server: string, _method: string, payload: unknown) {
        mcpCalls += 1;
        return { ok: true, payload };
      },
    } as unknown as ConstructorParameters<typeof ToolExecutor>[1],
    {
      pepContext: {
        sessionId: "run-1",
        traceId: "trace-1",
        userId: "user-1",
        workspaceRoot: "C:/workspace",
        interactive: false,
        roles: [],
      },
      capabilityScope: scope,
      async onEvent(event) {
        events.push(event);
      },
    },
  );
  return {
    toolExecutor,
    events,
    stats: () => ({ pepCalls, mcpCalls }),
  };
}

describe("ToolExecutor capability scope", () => {
  it("allows exact granted MCP tool names", async () => {
    const fixture = executor();

    const result = await fixture.toolExecutor.execute("filesystem:read_file", {
      path: "README.md",
    });

    expect(result.success).toBe(true);
    expect(fixture.stats()).toEqual({ pepCalls: 1, mcpCalls: 1 });
    expect(fixture.events.map((event) => event.kind)).toEqual([
      "tool.call.started",
      "tool.call.completed",
    ]);
  });

  it("denies ungranted tool names before PEP or MCP calls", async () => {
    const fixture = executor();

    const result = await fixture.toolExecutor.execute("filesystem:write_file", {
      path: "README.md",
    });

    expect(result).toMatchObject({
      success: false,
      error: "capability_scope_denied",
    });
    expect(fixture.stats()).toEqual({ pepCalls: 0, mcpCalls: 0 });
    expect(fixture.events[0]).toMatchObject({
      kind: "tool.call.failed",
      payload: {
        toolName: "filesystem:write_file",
        reason: "capability_scope_denied",
      },
    });
  });

  it("denies exact tools when an explicit MCP server allowlist excludes the server", async () => {
    const fixture = executor({
      toolNames: ["filesystem:read_file"],
      mcpServers: ["other-server"],
    });

    const result = await fixture.toolExecutor.execute("filesystem:read_file", {
      path: "README.md",
    });

    expect(result.success).toBe(false);
    expect(fixture.stats()).toEqual({ pepCalls: 0, mcpCalls: 0 });
  });

  it("routes execution through the gateway contract with profile and agent metadata", async () => {
    const calls: AgentMcpToolCallRequest[] = [];
    const events: RunEvent[] = [];
    const gateway: AgentMcpToolGateway = {
      async callTool(request) {
        calls.push(request);
        return {
          server: request.server,
          tool: request.tool,
          success: true,
          content: [{ type: "text", text: "hello" }],
          structuredContent: { ok: true },
          isError: false,
          latencyMs: 7,
          policy: {
            effect: "allow",
            reasonCodes: ["gateway_allow"],
            approvalRequired: false,
            traceId: "trace-1",
          },
          otel: {
            spanName: "tools/call read_file",
            attributes: {
              "mcp.method.name": "tools/call",
              "gen_ai.operation.name": "execute_tool",
              "gen_ai.tool.name": "read_file",
            },
            status: "OK",
          },
        };
      },
    };
    const toolExecutor = new ToolExecutor(gateway, {
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
      capabilityScope: {
        toolNames: ["filesystem:read_file"],
        mcpServers: ["filesystem"],
      },
      runtimeProfileName: "container",
      traceContext: {
        traceparent: "00-11111111111111111111111111111111-2222222222222222-01",
      },
      async onEvent(event) {
        events.push(event);
      },
    });

    const result = await toolExecutor.execute("filesystem:read_file", {
      path: "README.md",
    });

    expect(calls).toEqual([
      {
        server: "filesystem",
        tool: "read_file",
        arguments: { path: "README.md" },
        runId: "run-1",
        traceId: "trace-1",
        traceContext: {
          traceparent: "00-11111111111111111111111111111111-2222222222222222-01",
        },
        subagentId: "sub-1",
        role: "implementer",
        requestedLane: "delegated",
        runtimeProfileName: "container",
      },
    ]);
    expect(result).toMatchObject({
      success: true,
      output: "hello\n\nstructuredContent:\n{\"ok\":true}",
      mcp: {
        server: "filesystem",
        tool: "read_file",
        structuredContent: { ok: true },
        isError: false,
        otel: {
          spanName: "tools/call read_file",
          attributes: {
            "gen_ai.operation.name": "execute_tool",
            "gen_ai.tool.name": "read_file",
          },
        },
      },
    });
    expect(events.at(-1)).toMatchObject({
      kind: "tool.call.completed",
      payload: {
        toolName: "filesystem:read_file",
        mcpServer: "filesystem",
        nativeTool: "read_file",
        otel: {
          spanName: "tools/call read_file",
          attributes: {
            "gen_ai.operation.name": "execute_tool",
            "gen_ai.tool.name": "read_file",
          },
        },
      },
    });
  });

  it("preserves tool-originated MCP errors as isError results for model self-correction", async () => {
    const toolExecutor = new ToolExecutor(
      {
        async callTool(request) {
          return {
            server: request.server,
            tool: request.tool,
            success: false,
            content: [{ type: "text", text: "missing required path" }],
            structuredContent: { code: "missing_path" },
            isError: true,
            latencyMs: 4,
            otel: {
              spanName: "tools/call read_file",
              attributes: {
                "mcp.method.name": "tools/call",
                "gen_ai.operation.name": "execute_tool",
                "gen_ai.tool.name": "read_file",
              },
              status: "ERROR",
            },
          };
        },
      },
      {
        pepContext: {
          sessionId: "run-1",
          traceId: "trace-1",
          userId: "user-1",
          workspaceRoot: "C:/workspace",
          interactive: false,
          roles: [],
        },
      },
    );

    const result = await toolExecutor.execute("filesystem:read_file", {});
    const processed = handleToolResult(result, {
      id: "workspace-1",
      rootPath: "C:/workspace",
      sandboxProfile: "daemon",
      artifacts: new Map(),
    } satisfies Workspace);

    expect(result).toMatchObject({
      success: false,
      error: "missing required path",
      output: "missing required path\n\nstructuredContent:\n{\"code\":\"missing_path\"}",
      mcp: {
        isError: true,
        structuredContent: { code: "missing_path" },
      },
    });
    expect(processed.content).toBe(
      "ERROR: missing required path\n\nstructuredContent:\n{\"code\":\"missing_path\"}",
    );
  });

  it("normalizes legacy direct MCP manager results with isError=true", async () => {
    const direct = new ToolExecutor(
      {
        async enforce() {
          return {
            allowed: true,
            decision: { effect: "allow" },
            traceId: "trace-1",
          };
        },
      } as unknown as ConstructorParameters<typeof ToolExecutor>[0],
      {
        async request(_server: string, method: string, payload: unknown) {
          expect(method).toBe("tools/call");
          expect(payload).toEqual({
            name: "read_file",
            arguments: { path: "" },
          });
          return {
            content: [{ type: "text", text: "path cannot be empty" }],
            structuredContent: { code: "empty_path" },
            isError: true,
          };
        },
      } as unknown as ConstructorParameters<typeof ToolExecutor>[1],
      {
        pepContext: {
          sessionId: "run-1",
          traceId: "trace-1",
          userId: "user-1",
          workspaceRoot: "C:/workspace",
          interactive: false,
          roles: [],
        },
      },
    );

    const result = await direct.execute("filesystem:read_file", { path: "" });

    expect(result).toMatchObject({
      success: false,
      error: "path cannot be empty",
      output: "path cannot be empty\n\nstructuredContent:\n{\"code\":\"empty_path\"}",
      mcp: {
        server: "filesystem",
        tool: "read_file",
        isError: true,
        otel: {
          spanName: "tools/call read_file",
          attributes: {
            "gen_ai.operation.name": "execute_tool",
            "gen_ai.tool.name": "read_file",
          },
          status: "ERROR",
        },
      },
    });
  });
});
