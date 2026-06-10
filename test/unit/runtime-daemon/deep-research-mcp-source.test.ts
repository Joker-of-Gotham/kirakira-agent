import { describe, expect, it, vi } from "vitest";
import type { TaskNode } from "../../../packages/orchestrator-kernel/src/index.js";
import type { RuntimeMcpToolCallResult } from "../../../packages/runtime-contracts/src/index.js";
import {
  createDaemonDeepResearchKernelOptions,
  type DaemonDeepResearchOptions,
} from "../../../packages/runtime-daemon/src/index.js";

const node: TaskNode = {
  id: "research",
  kind: "research",
  spec: {
    description: "Collect MCP research evidence",
    research: {
      question: "What MCP evidence is available?",
      requiredSourceKinds: ["mcp"],
    },
  },
  status: "pending",
};

describe("daemon deep research MCP source composition", () => {
  it("wraps configured MCP sources with daemon run, trace, and lane context", async () => {
    const runtimeResult: RuntimeMcpToolCallResult = {
      server: "docs",
      tool: "search",
      success: true,
      content: [{ type: "text", text: "Daemon MCP evidence" }],
      latencyMs: 5,
      policy: {
        effect: "allow",
        reasonCodes: [],
        approvalRequired: false,
        traceId: "policy-trace",
      },
      otel: {
        traceId: "otel-trace",
        spanId: "span-1",
        spanName: "tools/call search",
        status: "OK",
      },
    };
    const callTool = vi.fn(async (): Promise<RuntimeMcpToolCallResult> => runtimeResult);
    const daemonDeepResearch: DaemonDeepResearchOptions = {
      config: {
        enabled: true,
        source_policy: "verified",
        max_depth: 1,
        max_breadth: 1,
        max_tool_calls: 1,
        require_citations: true,
      },
      mcp: {
        port: { callTool },
        targets: [
          {
            server: "docs",
            tool: "search",
            arguments: (request) => ({ query: request.query, taskId: request.taskId }),
          },
        ],
        retrievedAt: "2026-06-10T00:00:00.000Z",
      },
    };
    const options = createDaemonDeepResearchKernelOptions({ daemonDeepResearch });
    if (!options?.sourceAdapters) throw new Error("missing source adapters");
    const adapters = options.sourceAdapters({
      runId: "run-1",
      traceId: "trace-1",
      workspaceRoot: "C:/workspace",
      node,
      lane: "background",
    });

    expect(adapters.map((adapter) => adapter.kind)).toEqual(["mcp"]);
    const evidence = await adapters[0]!.search({
      taskId: "research-mcp",
      query: "What MCP evidence is available?",
      sourceKind: "mcp",
      limits: { maxDepth: 1, maxBreadth: 1, maxToolCalls: 1 },
      requireCitations: true,
    });

    expect(callTool).toHaveBeenCalledWith({
      server: "docs",
      tool: "search",
      arguments: {
        query: "What MCP evidence is available?",
        taskId: "research-mcp",
      },
      runId: "run-1",
      traceId: "trace-1",
      requestedLane: "background",
    });
    expect(evidence[0]).toMatchObject({
      sourceKind: "mcp",
      title: "docs:search",
      citations: [
        expect.objectContaining({
          sourceKind: "mcp",
          uri: "mcp://docs/search",
          traceId: "otel-trace",
          provenanceIds: ["span-1"],
        }),
      ],
    });
  });

  it("does not create an MCP source when no MCP target resolver is configured", () => {
    const options = createDaemonDeepResearchKernelOptions({
      daemonDeepResearch: {
        config: {
          enabled: true,
          source_policy: "verified",
        },
      },
    });

    const adapters = options?.sourceAdapters?.({
      runId: "run-1",
      workspaceRoot: "C:/workspace",
      node,
      lane: "background",
    }) ?? [];

    expect(adapters.map((adapter) => adapter.kind)).not.toContain("mcp");
  });

  it("derives MCP targets from the selected runtime profile when a daemon MCP port is available", async () => {
    const callTool = vi.fn(async (request): Promise<RuntimeMcpToolCallResult> => ({
      server: request.server,
      tool: request.tool,
      success: true,
      content: [{ type: "text", text: `profile evidence from ${request.server}:${request.tool}` }],
      latencyMs: 2,
      policy: {
        effect: "allow",
        reasonCodes: [],
        approvalRequired: false,
        traceId: "policy-profile",
      },
      otel: {
        traceId: "otel-profile",
        spanId: "span-profile",
        spanName: `tools/call ${request.tool}`,
        status: "OK",
      },
    }));
    const options = createDaemonDeepResearchKernelOptions({
      runtimeProfileName: "selected",
      resolvedConfig: {
        agentToml: {
          deep_research: {
            enabled: true,
            source_policy: "verified",
          },
        },
        runtimeState: {
          default_profile: "other",
          profiles: [
            {
              name: "other",
              mode: "host",
              deep_research: {
                mcp: {
                  targets: [
                    {
                      server: "wrong-server",
                      tool: "wrong-tool",
                    },
                  ],
                },
              },
            },
            {
              name: "selected",
              mode: "host",
              deep_research: {
                mcp: {
                  include_error_evidence: true,
                  max_evidence: 2,
                  targets: [
                    {
                      server: "profile-docs",
                      tool: "query",
                      title: "Profile docs",
                      metadata: {
                        alias: "docs.query",
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
      },
      mcpPort: { callTool },
    });
    if (!options?.sourceAdapters) throw new Error("missing source adapters");
    const adapters = options.sourceAdapters({
      runId: "run-1",
      traceId: "trace-1",
      workspaceRoot: "C:/workspace",
      node,
      lane: "background",
    });

    expect(adapters.map((adapter) => adapter.kind)).toEqual(["mcp"]);
    const evidence = await adapters[0]!.search({
      taskId: "research-mcp",
      query: "What MCP evidence is available?",
      sourceKind: "mcp",
      limits: { maxDepth: 1, maxBreadth: 2, maxToolCalls: 1 },
      requireCitations: true,
    });

    expect(callTool).toHaveBeenCalledTimes(1);
    expect(callTool).toHaveBeenCalledWith({
      server: "profile-docs",
      tool: "query",
      arguments: {
        query: "What MCP evidence is available?",
        taskId: "research-mcp",
        sourceKind: "mcp",
        limits: { maxDepth: 1, maxBreadth: 2, maxToolCalls: 1 },
        requireCitations: true,
      },
      runId: "run-1",
      traceId: "trace-1",
      requestedLane: "background",
    });
    expect(JSON.stringify(callTool.mock.calls)).not.toContain("wrong-server");
    expect(evidence[0]).toMatchObject({
      sourceKind: "mcp",
      title: "Profile docs",
      citations: [
        expect.objectContaining({
          uri: "mcp://profile-docs/query",
          metadata: expect.objectContaining({
            server: "profile-docs",
            tool: "query",
            source: "runtime-profile",
            alias: "docs.query",
          }),
        }),
      ],
    });
  });
});
