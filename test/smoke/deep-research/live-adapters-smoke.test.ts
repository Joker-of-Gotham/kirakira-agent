import { afterEach, describe, expect, it } from "vitest";

import {
  DeepResearchRunner,
  mcpProviderFromToolCalls,
  resolveDeepResearchOptions,
} from "../../../packages/deep-research/src/index.js";
import {
  DEEP_RESEARCH_HTTP_SERVER,
  DEEP_RESEARCH_LIVE_MCP_TOOL,
  DEEP_RESEARCH_LIVE_RETRIEVED_AT,
  DEEP_RESEARCH_STDIO_SERVER,
  startDeepResearchLiveMcpFixture,
  type DeepResearchLiveMcpFixture,
} from "../../helpers/deep-research-live-mcp.js";

describe("deep research live adapter gate", () => {
  const fixtures: DeepResearchLiveMcpFixture[] = [];

  afterEach(async () => {
    await Promise.allSettled(fixtures.splice(0).map((fixture) => fixture.close()));
  });

  it("collects research evidence through daemon-governed live MCP transports", async () => {
    const fixture = await startDeepResearchLiveMcpFixture();
    fixtures.push(fixture);
    const adapter = mcpProviderFromToolCalls({
      port: fixture.runtime,
      targets: [
        {
          server: DEEP_RESEARCH_STDIO_SERVER,
          tool: DEEP_RESEARCH_LIVE_MCP_TOOL,
          arguments: (request) => ({ query: request.query, source: "stdio" }),
        },
        {
          server: DEEP_RESEARCH_HTTP_SERVER,
          tool: DEEP_RESEARCH_LIVE_MCP_TOOL,
          arguments: (request) => ({ query: request.query, source: "http" }),
        },
      ],
      context: {
        runId: "run-deep-research-live",
        traceId: "1234567890abcdef1234567890abcdef",
      },
      retrievedAt: DEEP_RESEARCH_LIVE_RETRIEVED_AT,
    });
    const runner = new DeepResearchRunner({
      options: resolveDeepResearchOptions(
        {
          enabled: true,
          source_policy: "verified",
          max_depth: 1,
          max_breadth: 2,
          max_tool_calls: 1,
          require_citations: true,
        },
        fixture.workspaceRoot,
        { availableSourceKinds: ["mcp"] },
      ),
      sourceAdapters: [adapter],
    });

    const result = await runner.run({
      prompt: "Collect live MCP evidence for deep research",
      requiredSourceKinds: ["mcp"],
    });

    expect(result).toMatchObject({
      status: "evidence_collected",
      toolCalls: 1,
    });
    expect(result.evidence).toHaveLength(2);
    expect(result.citations.map((citation) => citation.uri).sort()).toEqual([
      "mcp+smoke://http/research-evidence",
      "mcp+smoke://stdio/research-evidence",
    ]);
    expect(result.evidence.map((item) => item.sourceKind)).toEqual(["mcp", "mcp"]);
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "stdio MCP research evidence",
          metadata: expect.objectContaining({
            server: DEEP_RESEARCH_STDIO_SERVER,
            tool: DEEP_RESEARCH_LIVE_MCP_TOOL,
            policyEffect: "allow",
            trustTier: "verified",
            otelSpanName: `tools/call ${DEEP_RESEARCH_LIVE_MCP_TOOL}`,
          }),
        }),
        expect.objectContaining({
          title: "http MCP research evidence",
          metadata: expect.objectContaining({
            server: DEEP_RESEARCH_HTTP_SERVER,
            tool: DEEP_RESEARCH_LIVE_MCP_TOOL,
            policyEffect: "allow",
            trustTier: "verified",
            otelSpanName: `tools/call ${DEEP_RESEARCH_LIVE_MCP_TOOL}`,
          }),
        }),
      ]),
    );
    expect(fixture.httpRequests.some((request) => request.method === "tools/list")).toBe(true);
    expect(fixture.httpRequests.some((request) => request.method === "tools/call")).toBe(true);
    expect(fixture.exporter.spans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: `tools/call ${DEEP_RESEARCH_LIVE_MCP_TOOL}`,
          status: { code: "OK" },
          attributes: expect.objectContaining({
            "mcp.server.name": DEEP_RESEARCH_STDIO_SERVER,
            "mcp.protocol.version": "2025-11-25",
            "gen_ai.operation.name": "execute_tool",
            "gen_ai.tool.name": DEEP_RESEARCH_LIVE_MCP_TOOL,
            "kirakira.policy.decision_id": "decision-deep-research-live",
          }),
        }),
        expect.objectContaining({
          name: `tools/call ${DEEP_RESEARCH_LIVE_MCP_TOOL}`,
          status: { code: "OK" },
          attributes: expect.objectContaining({
            "mcp.server.name": DEEP_RESEARCH_HTTP_SERVER,
            "mcp.protocol.version": "2025-11-25",
            "gen_ai.operation.name": "execute_tool",
            "gen_ai.tool.name": DEEP_RESEARCH_LIVE_MCP_TOOL,
            "kirakira.policy.decision_id": "decision-deep-research-live",
          }),
        }),
      ]),
    );
  });
});
