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

  it("renders the workbench host profile for web and desktop surfaces", () => {
    const profile = resolveRuntimeProfile("workbench-host", loadRuntimeProfiles());
    const env = renderRuntimeEnv(profile);

    expect(renderComposeArgs(profile)).toEqual([
      "-f",
      "docker-compose.yml",
      "-f",
      "docker-compose.ports.yml",
    ]);
    expect(env.KIRAKIRA_RUNTIME_PROFILE).toBe("workbench-host");
    expect(env.KIRAKIRA_DAEMON_SOCKET).toBe(".kirakira/runtime/daemon.sock");
    expect(env.KIRAKIRA_BROWSER_GATEWAY_ENABLED).toBe("1");
    expect(env.VITE_KIRAKIRA_RUNTIME_MODE).toBe("gateway");
    expect(env.VITE_KIRAKIRA_GATEWAY_URL).toBe("ws://127.0.0.1:17373/runtime");
    expect(env.KIRAKIRA_WEB_URL).toBe("http://127.0.0.1:5183");
    expect(env.KIRAKIRA_DESKTOP_RENDERER_URL).toBe("http://127.0.0.1:5174");
    expect(env.KIRAKIRA_DESKTOP_DEV_URL).toBe("http://127.0.0.1:5174");
  });
});
