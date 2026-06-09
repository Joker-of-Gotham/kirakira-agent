import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { PolicyDecision } from "@kirakira/core";
import type { McpClientManager } from "@kirakira/mcp-adapter";
import type { EnforcementResult, McpPep } from "@kirakira/policy-engine";
import { describe, expect, it, vi } from "vitest";
import {
  DaemonMcpRuntime,
  createDaemonMcpDependencies,
} from "../../../packages/runtime-daemon/src/index.js";

function decision(effect: PolicyDecision["effect"]): EnforcementResult {
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

function fakeManager(rawResult: unknown): {
  manager: McpClientManager;
  request: ReturnType<typeof vi.fn>;
  registerServer: ReturnType<typeof vi.fn>;
  registerMany: ReturnType<typeof vi.fn>;
  startServer: ReturnType<typeof vi.fn>;
  stopAll: ReturnType<typeof vi.fn>;
} {
  let started = false;
  const request = vi.fn(async () => rawResult);
  const registerServer = vi.fn();
  const registerMany = vi.fn();
  const startServer = vi.fn(async () => {
    started = true;
  });
  const stopAll = vi.fn(async () => {});
  const manager = {
    registerMany,
    registerServer,
    listServers: vi.fn(() => ["filesystem-core"]),
    getHealth: vi.fn(() => (started ? "healthy" : "stopped")),
    getLastError: vi.fn(() => undefined),
    startServer,
    request,
    stopAll,
  } as unknown as McpClientManager;
  return { manager, request, registerServer, registerMany, startServer, stopAll };
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
      });

      expect(pep.enforce).toHaveBeenCalledWith(
        expect.objectContaining({
          mcpServer: "filesystem-core",
          toolName: "read_file",
          args: ["README.md"],
        }),
        expect.objectContaining({
          sessionId: "run-1",
          traceId: "trace-1",
          workspaceRoot,
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
      expect(result.servers).toEqual([
        {
          name: "filesystem-core",
          health: "healthy",
          toolCount: 1,
          tools: [
            {
              name: "read_file",
              title: "Read file",
              description: "Read file content",
              inputSchema: { type: "object", properties: { path: { type: "string" } } },
              outputSchema: { type: "object" },
            },
          ],
        },
      ]);
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
});
