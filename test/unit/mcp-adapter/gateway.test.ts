import { describe, expect, it } from "vitest";

import type { McpClientManager } from "../../../packages/mcp-adapter/src/client.js";
import { McpGateway } from "../../../packages/mcp-adapter/src/gateway.js";

interface ToolInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

function managerWithTools(toolsByServer: Record<string, ToolInfo[]>): McpClientManager {
  return {
    listServers: () => Object.keys(toolsByServer),
    startServer: async () => {},
    stopAll: async () => {},
    getHealth: (server: string) => (server in toolsByServer ? "healthy" : "stopped"),
    getLastError: () => undefined,
    getConfig: () => undefined,
    request: async (server: string, method: string) => {
      if (method !== "tools/list") {
        throw new Error(`Unexpected request: ${method}`);
      }
      return { tools: toolsByServer[server] ?? [] };
    },
  } as unknown as McpClientManager;
}

describe("McpGateway alias catalog", () => {
  it("keeps the legacy alias catalog as the default API behavior", async () => {
    const gateway = new McpGateway({
      manager: managerWithTools({
        "filesystem-core": [{ name: "read_file", description: "Native read" }],
      }),
    });

    await gateway.refreshToolCache();

    expect(gateway.resolveTool("fs.read_text")).toMatchObject({
      alias: "fs.read_text",
      server: "filesystem-core",
      nativeTool: "read_file",
      description: "Read a text file",
      riskLevel: "low",
      readOnly: true,
    });
  });

  it("merges injected aliases with the default catalog and lets injected aliases override", async () => {
    const gateway = new McpGateway({
      manager: managerWithTools({
        "filesystem-core": [{ name: "read_file" }],
        docs: [{ name: "search" }],
      }),
      aliasCatalog: {
        aliases: [
          {
            alias: "docs.search",
            server: "docs",
            tool: "search",
            description: "Search docs",
            riskLevel: "low",
            readOnly: true,
          },
          {
            alias: "fs.read_text",
            server: "docs",
            tool: "search",
            description: "Profile override",
            riskLevel: "medium",
            readOnly: true,
          },
        ],
      },
    });

    await gateway.refreshToolCache();

    expect(gateway.resolveTool("docs.search")).toMatchObject({
      alias: "docs.search",
      server: "docs",
      nativeTool: "search",
      riskLevel: "low",
      readOnly: true,
    });
    expect(gateway.resolveTool("fs.read_text")).toMatchObject({
      alias: "fs.read_text",
      server: "docs",
      nativeTool: "search",
      description: "Profile override",
      riskLevel: "medium",
    });
  });

  it("allows callers to disable built-in aliases for a profile-owned catalog", async () => {
    const gateway = new McpGateway({
      manager: managerWithTools({
        "filesystem-core": [{ name: "read_file" }],
        docs: [{ name: "search" }],
      }),
      aliasCatalog: {
        includeBuiltins: false,
        aliases: [
          {
            alias: "docs.search",
            server: "docs",
            tool: "search",
            riskLevel: "low",
            readOnly: true,
          },
        ],
      },
    });

    await gateway.refreshToolCache();

    expect(gateway.resolveTool("docs.search")).toMatchObject({
      alias: "docs.search",
      server: "docs",
      nativeTool: "search",
    });
    expect(gateway.resolveTool("fs.read_text")).toBeUndefined();
    expect(gateway.getSummary().aliases).toBe(1);
  });
});
