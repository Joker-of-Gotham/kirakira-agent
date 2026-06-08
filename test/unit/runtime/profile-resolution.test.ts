import { describe, expect, it } from "vitest";
import {
  loadRuntimeProfiles,
  renderComposeArgs,
  renderMcpConfig,
  renderRuntimeEnv,
  resolveRuntimeProfile,
} from "../../../scripts/runtime-profile.mjs";

describe("runtime profile rendering", () => {
  it("resolves the default container profile", () => {
    const profile = resolveRuntimeProfile(undefined, loadRuntimeProfiles());

    expect(profile.name).toBe("container");
    expect(profile.workspaceRoot).toBe("/workspace");
    expect(renderComposeArgs(profile)).toEqual(["-f", "docker-compose.yml", "--profile", "cli"]);
  });

  it("renders env and MCP roots from the selected profile", () => {
    const profile = resolveRuntimeProfile("host", loadRuntimeProfiles());
    const env = renderRuntimeEnv(profile);
    const mcp = renderMcpConfig(profile);

    expect(env.KIRAKIRA_RUNTIME_PROFILE).toBe("host");
    expect(env.KIRAKIRA_MCP_WORKSPACE_ROOT).toBe(".");
    expect(mcp.mcpServers["filesystem-core"].args.at(-1)).toBe(".");
    expect(mcp.mcpServers["filesystem-patch"].args.at(-1)).toBe(".");
  });

  it("allows environment roots to override profile defaults", () => {
    const profile = resolveRuntimeProfile("container", loadRuntimeProfiles(), {
      KIRAKIRA_WORKSPACE_ROOT: "/repo",
      KIRAKIRA_MCP_WORKSPACE_ROOT: "/mcp-repo",
      KIRAKIRA_APP_ROOT: "/runtime",
      KIRAKIRA_MCP_APP_ROOT: "/mcp-runtime",
    });
    const mcp = renderMcpConfig(profile);

    expect(profile.workspaceRoot).toBe("/repo");
    expect(profile.appRoot).toBe("/runtime");
    expect(mcp.mcpServers["filesystem-core"].args.at(-1)).toBe("/mcp-repo");
    expect(mcp.mcpServers["filesystem-artifact"].args[0]).toContain("/mcp-runtime/");
  });
});
