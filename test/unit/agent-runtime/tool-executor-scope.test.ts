import { describe, expect, it } from "vitest";
import type { RunEvent } from "../../../packages/event-store/src/index.js";
import { ToolExecutor } from "../../../packages/agent-runtime/src/tools/tool-executor.js";

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
});
