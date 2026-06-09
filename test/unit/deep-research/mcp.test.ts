import { describe, expect, it, vi } from "vitest";
import {
  DeepResearchRunner,
  mcpProviderFromToolCalls,
  resolveDeepResearchOptions,
  type McpResearchToolCallPort,
} from "../../../packages/deep-research/src/index.js";

const limits = { maxDepth: 2, maxBreadth: 4, maxToolCalls: 8 };

describe("MCP research source adapter", () => {
  it("calls configured MCP targets through an injected port and maps structured evidence", async () => {
    const callTool = vi.fn(async () => ({
      server: "docs",
      tool: "search",
      success: true,
      structuredContent: {
        evidence: [
          {
            title: "MCP tool evidence",
            summary: "MCP tools/call returns structured research evidence.",
            content: "The MCP tool result includes citation-ready evidence.",
            confidence: 0.88,
            citations: [
              {
                id: "docs-citation",
                title: "MCP docs",
                uri: "https://example.test/mcp",
                score: 9,
              },
            ],
          },
        ],
      },
      latencyMs: 12,
      policy: {
        effect: "allow",
        traceId: "policy-trace",
        decisionId: "decision-1",
      },
      trust: { tier: "verified" },
      otel: {
        traceId: "otel-trace",
        spanId: "span-1",
        spanName: "tools/call search",
        status: "OK",
      },
    }));
    const port: McpResearchToolCallPort = { callTool };
    const adapter = mcpProviderFromToolCalls({
      port,
      targets: [
        {
          server: "docs",
          tool: "search",
          arguments: (request) => ({ q: request.query, limit: request.limits.maxBreadth }),
          metadata: { catalog: "runtime-profile" },
        },
      ],
      context: { runId: "run-1", traceId: "trace-1" },
      retrievedAt: "2026-06-10T00:00:00.000Z",
    });

    const evidence = await adapter.search({
      taskId: "research-mcp",
      query: "MCP tools call evidence",
      sourceKind: "mcp",
      limits,
      requireCitations: true,
    });

    expect(callTool).toHaveBeenCalledWith({
      server: "docs",
      tool: "search",
      arguments: { q: "MCP tools call evidence", limit: 4 },
      runId: "run-1",
      traceId: "trace-1",
    });
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({
      sourceKind: "mcp",
      title: "MCP tool evidence",
      summary: "MCP tools/call returns structured research evidence.",
      confidence: 0.88,
      citations: [
        expect.objectContaining({
          id: "docs-citation",
          sourceKind: "mcp",
          uri: "https://example.test/mcp",
          retrievedAt: "2026-06-10T00:00:00.000Z",
          traceId: "otel-trace",
          queryId: "research-mcp",
          provenanceIds: ["decision-1", "span-1"],
          metadata: expect.objectContaining({
            server: "docs",
            tool: "search",
            catalog: "runtime-profile",
            policyEffect: "allow",
            trustTier: "verified",
            otelSpanName: "tools/call search",
          }),
        }),
      ],
    });
    expect(evidence[0]?.content).toContain("citation-ready evidence");
  });

  it("uses target resolvers without inventing server or tool names", async () => {
    const calls: Array<{ server: string; tool: string; arguments?: Record<string, unknown> }> = [];
    const adapter = mcpProviderFromToolCalls({
      port: {
        async callTool(request) {
          calls.push({
            server: request.server,
            tool: request.tool,
            arguments: request.arguments,
          });
          return {
            server: request.server,
            tool: request.tool,
            success: true,
            content: [{ type: "text", text: `result from ${request.server}:${request.tool}` }],
            latencyMs: 1,
            policy: { effect: "allow", traceId: "policy" },
          };
        },
      },
      targets: (request) => [
        {
          server: request.query.includes("docs") ? "docs-live" : "kb-live",
          tool: "query",
        },
      ],
      retrievedAt: "2026-06-10T00:00:00.000Z",
    });

    const evidence = await adapter.search({
      taskId: "research-mcp",
      query: "docs MCP lookup",
      sourceKind: "mcp",
      limits,
      requireCitations: true,
    });

    expect(calls).toEqual([
      {
        server: "docs-live",
        tool: "query",
        arguments: {
          query: "docs MCP lookup",
          taskId: "research-mcp",
          sourceKind: "mcp",
          limits,
          requireCitations: true,
        },
      },
    ]);
    expect(evidence[0]).toMatchObject({
      sourceKind: "mcp",
      title: "docs-live:query",
      citations: [
        expect.objectContaining({
          uri: "mcp://docs-live/query",
          sourceRecordId: "docs-live:query",
        }),
      ],
    });
  });

  it("keeps tool-originated errors as bounded MCP evidence for self-correction", async () => {
    const adapter = mcpProviderFromToolCalls({
      port: {
        async callTool() {
          return {
            server: "docs",
            tool: "search",
            success: false,
            isError: true,
            error: "query is too broad",
            latencyMs: 3,
            policy: { effect: "allow", traceId: "policy" },
            otel: { status: "ERROR" },
          };
        },
      },
      targets: [{ server: "docs", tool: "search" }],
      retrievedAt: "2026-06-10T00:00:00.000Z",
    });

    const evidence = await adapter.search({
      taskId: "research-mcp",
      query: "everything",
      sourceKind: "mcp",
      limits,
      requireCitations: true,
    });

    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({
      sourceKind: "mcp",
      summary: "MCP tool docs:search returned an error.",
      content: "query is too broad",
      confidence: 0,
      metadata: expect.objectContaining({
        success: false,
        isError: true,
        otelStatus: "ERROR",
      }),
    });
  });

  it("runs as a verified deep-research source kind through the generic runner", async () => {
    const adapter = mcpProviderFromToolCalls({
      port: {
        async callTool() {
          return {
            server: "verified-docs",
            tool: "lookup",
            success: true,
            content: [{ type: "text", text: "Verified MCP evidence" }],
            policy: { effect: "allow", traceId: "policy" },
          };
        },
      },
      targets: [{ server: "verified-docs", tool: "lookup" }],
      retrievedAt: "2026-06-10T00:00:00.000Z",
    });
    const runner = new DeepResearchRunner({
      options: resolveDeepResearchOptions(
        {
          enabled: true,
          source_policy: "verified",
          max_tool_calls: 1,
        },
        "C:/workspace",
        { availableSourceKinds: ["mcp"] },
      ),
      sourceAdapters: [adapter],
    });

    const result = await runner.run({
      prompt: "Find verified MCP evidence",
      requiredSourceKinds: ["mcp"],
    });

    expect(result.status).toBe("evidence_collected");
    expect(result.toolCalls).toBe(1);
    expect(result.evidence[0]?.sourceKind).toBe("mcp");
    expect(result.citations[0]?.uri).toBe("mcp://verified-docs/lookup");
  });
});
