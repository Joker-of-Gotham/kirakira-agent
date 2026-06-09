import { describe, expect, it, vi } from "vitest";
import { DaemonLifecycle } from "../../../packages/runtime-daemon/src/index.js";
import type {
  RuntimeMcpToolCallResult,
  RunEvent,
} from "../../../packages/runtime-contracts/src/index.js";

describe("DaemonLifecycle MCP direct call events", () => {
  it("emits run timeline events around direct MCP tool calls with a run id", async () => {
    const daemon = new DaemonLifecycle() as unknown as {
      mcpRuntime: { callTool: ReturnType<typeof vi.fn> };
      kernelBridge: {
        getKernel(): {
          getWriter(): { append(event: RunEvent): RunEvent };
        };
      };
      sendToClient: ReturnType<typeof vi.fn>;
      dispatchEvent(event: RunEvent): void;
      handleMcpCall(clientId: string, msg: Record<string, unknown>): Promise<void>;
    };
    const events: RunEvent[] = [];
    const result: RuntimeMcpToolCallResult = {
      server: "filesystem-core",
      tool: "read_file",
      success: true,
      content: [{ type: "text", text: "preview" }],
      latencyMs: 4,
      policy: {
        effect: "allow",
        reasonCodes: ["baseline_read_workspace"],
        approvalRequired: false,
        traceId: "trace-1",
      },
    };
    daemon.mcpRuntime = {
      callTool: vi.fn(async () => result),
    };
    daemon.kernelBridge = {
      getKernel() {
        return {
          getWriter() {
            return {
              append(event: RunEvent) {
                return { ...event, checkpointSeq: events.length + 1 };
              },
            };
          },
        };
      },
    };
    daemon.sendToClient = vi.fn();
    daemon.dispatchEvent = (event: RunEvent) => {
      events.push(event);
    };

    await daemon.handleMcpCall("client-1", {
      type: "mcp_call",
      messageId: "mcp-1",
      server: "filesystem-core",
      tool: "read_file",
      arguments: { path: "README.md" },
      runId: "run-1",
      traceId: "trace-1",
    });

    expect(daemon.mcpRuntime.callTool).toHaveBeenCalledWith({
      server: "filesystem-core",
      tool: "read_file",
      arguments: { path: "README.md" },
      runId: "run-1",
      traceId: "trace-1",
    });
    expect(daemon.sendToClient).toHaveBeenCalledWith("client-1", {
      type: "ack",
      messageId: "mcp-1",
      result,
    });
    expect(events.map((event) => event.kind)).toEqual([
      "tool.call.started",
      "tool.call.completed",
    ]);
    expect(events[0]).toMatchObject({
      runId: "run-1",
      checkpointSeq: 1,
      payload: {
        toolName: "filesystem-core:read_file",
        toolId: "mcp.filesystem-core.read_file",
        mcpServer: "filesystem-core",
        source: "runtime.mcp_call",
      },
    });
    expect(events[1]).toMatchObject({
      runId: "run-1",
      checkpointSeq: 2,
      payload: {
        toolName: "filesystem-core:read_file",
        success: true,
        latencyMs: 4,
        policy: result.policy,
      },
    });
  });
});
