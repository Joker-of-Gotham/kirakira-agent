import { describe, expect, it } from "vitest";
import { createMcpDirectoryView } from "../../../packages/frontend-core/src/mcp-directory.js";
import type { RuntimeMcpListResult } from "@kirakira/runtime-contracts";

describe("frontend-core MCP directory view", () => {
  it("summarizes server health and discovered tools", () => {
    const result: RuntimeMcpListResult = {
      generatedAt: "2026-06-09T12:00:00.000Z",
      servers: [
        {
          name: "docs",
          health: "healthy",
          toolCount: 1,
          tools: [
            {
              name: "search",
              title: "Search docs",
              description: "Search authoritative docs",
              inputSchema: {
                type: "object",
                properties: {
                  query: { type: "string", description: "Search query" },
                  limit: { type: "number" },
                },
                required: ["query"],
              },
              trust: {
                tier: "trusted",
                source: "config",
                trustedAnnotations: true,
                firstUse: false,
              },
              policy: {
                decision: "allow",
                source: "gateway-default",
                reasonCodes: ["mcp_gateway_default_allow"],
                approvalRequired: false,
                obligations: {
                  snapshotRequired: false,
                  dryRunRequired: false,
                  auditRequired: false,
                },
              },
            },
          ],
        },
        {
          name: "filesystem",
          health: "unhealthy",
          error: "spawn failed",
        },
      ],
    };

    const view = createMcpDirectoryView(result);

    expect(view.generatedAt).toBe(result.generatedAt);
    expect(view.summary).toEqual({
      serverCount: 2,
      readyServerCount: 1,
      attentionServerCount: 1,
      toolCount: 1,
    });
    expect(view.servers.map((server) => [server.name, server.tone])).toEqual([
      ["filesystem", "failed"],
      ["docs", "ready"],
    ]);
    expect(view.tools[0]).toMatchObject({
      id: "docs:search",
      server: "docs",
      name: "search",
      title: "Search docs",
      inputPropertyCount: 2,
      requiredInputCount: 1,
      argumentDraft: JSON.stringify({ query: "" }, null, 2),
      trust: {
        tier: "trusted",
        source: "config",
        trustedAnnotations: true,
        firstUse: false,
      },
    });
    expect(view.tools[0]?.inputFields).toEqual([
      {
        name: "query",
        required: true,
        type: "string",
        description: "Search query",
        defaultValue: "",
      },
      {
        name: "limit",
        required: false,
        type: "number",
        defaultValue: 0,
      },
    ]);
  });

  it("returns an empty directory when discovery has not loaded", () => {
    const view = createMcpDirectoryView(undefined);

    expect(view.summary).toEqual({
      serverCount: 0,
      readyServerCount: 0,
      attentionServerCount: 0,
      toolCount: 0,
    });
    expect(view.servers).toEqual([]);
    expect(view.tools).toEqual([]);
  });
});
