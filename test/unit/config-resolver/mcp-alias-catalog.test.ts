import { describe, expect, it } from "vitest";

import {
  loadRuntimeProfiles,
  renderMcpAliasCatalog,
  renderMcpConfig,
  resolveRuntimeProfile,
} from "../../../scripts/runtime-profile.mjs";

describe("runtime MCP alias catalog", () => {
  it("renders aliases from the selected MCP catalog servers", () => {
    const profile = resolveRuntimeProfile("host", loadRuntimeProfiles());
    const aliases = renderMcpAliasCatalog(profile);

    expect(aliases.find((alias) => alias.alias === "fs.read_text")).toMatchObject({
      server: "filesystem-core",
      tool: "read_file",
      riskLevel: "low",
      readOnly: true,
    });
    expect(aliases.find((alias) => alias.alias === "artifact.preview")).toMatchObject({
      server: "filesystem-artifact",
      tool: "preview_structured",
      riskLevel: "low",
      readOnly: true,
    });
  });

  it("keeps renderMcpConfig server-only by default and can include aliases explicitly", () => {
    const profile = resolveRuntimeProfile("host", loadRuntimeProfiles());
    const serversOnly = renderMcpConfig(profile);
    const withAliases = renderMcpConfig(profile, { includeAliases: true });

    expect(Object.keys(serversOnly)).toEqual(["mcpServers"]);
    expect(withAliases.mcpAliases).toEqual(renderMcpAliasCatalog(profile));
  });

  it("merges top-level, server, and profile MCP aliases with profile aliases winning", () => {
    const config = {
      schemaVersion: 1,
      defaultProfile: "custom",
      mcpCatalog: {
        defaultServerGroups: ["default"],
        aliases: [
          {
            alias: "catalog.search",
            server: "docs",
            tool: "search",
            riskLevel: "low",
            readOnly: true,
          },
        ],
        groups: {
          default: ["docs"],
        },
        servers: {
          docs: {
            command: "node",
            args: ["docs.js"],
            aliases: [
              {
                alias: "docs.search",
                tool: "search",
                description: "Search docs",
                riskLevel: "low",
                readOnly: true,
              },
              {
                alias: "docs.write",
                tool: "write",
                riskLevel: "high",
                readOnly: false,
              },
            ],
          },
        },
      },
      profiles: {
        custom: {
          mode: "host",
          workspaceRoot: "/repo",
          appRoot: "/app",
          mcp: {
            aliases: [
              {
                alias: "docs.search",
                server: "docs",
                tool: "search_v2",
                description: "Profile override",
                riskLevel: "medium",
                readOnly: true,
              },
            ],
          },
        },
      },
    };

    const profile = resolveRuntimeProfile("custom", config, {});
    const aliases = renderMcpAliasCatalog(profile, { config });

    expect(aliases).toEqual([
      {
        alias: "catalog.search",
        server: "docs",
        tool: "search",
        riskLevel: "low",
        readOnly: true,
      },
      {
        alias: "docs.search",
        server: "docs",
        tool: "search_v2",
        description: "Profile override",
        riskLevel: "medium",
        readOnly: true,
      },
      {
        alias: "docs.write",
        server: "docs",
        tool: "write",
        riskLevel: "high",
        readOnly: false,
      },
    ]);
  });
});
