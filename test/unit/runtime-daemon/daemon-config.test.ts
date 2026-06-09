import { describe, expect, it } from "vitest";
import {
  loadRuntimeProfiles,
  renderRuntimeEnv,
  resolveRuntimeProfile,
} from "../../../scripts/runtime-profile.mjs";
import {
  browserGatewayConfigFromEnv,
  daemonConfigFromEnv,
} from "../../../packages/runtime-daemon/src/index.js";

describe("runtime daemon env config", () => {
  it("keeps optional browser gateway disabled unless the profile enables it", () => {
    expect(browserGatewayConfigFromEnv({})).toBeUndefined();
    expect(daemonConfigFromEnv({})).toEqual({
      socketPath: undefined,
      eventStorePath: undefined,
      browserGateway: undefined,
    });
  });

  it("consumes the profile-rendered workbench daemon env contract", () => {
    const profile = resolveRuntimeProfile("workbench-host", loadRuntimeProfiles(), {});
    const env = renderRuntimeEnv(profile);
    const config = daemonConfigFromEnv(env);

    expect(config.socketPath).toBe(env.KIRAKIRA_DAEMON_SOCKET);
    expect(config.eventStorePath).toBe(".kirakira/runtime/events.sqlite");
    expect(config.kernel?.workspaceRoot).toBe(".");
    expect(config.browserGateway).toEqual({
      enabled: true,
      host: "127.0.0.1",
      port: 17373,
      path: "/runtime",
      token: undefined,
      allowedOrigins: ["http://127.0.0.1:5183", "http://127.0.0.1:5174"],
    });
    expect(JSON.stringify(config)).not.toContain("5173");
  });

  it("preserves profile endpoint overrides and explicit MCP config paths", () => {
    const profile = resolveRuntimeProfile("workbench-host", loadRuntimeProfiles(), {
      KIRAKIRA_WEB_PORT: "5184",
      KIRAKIRA_DESKTOP_RENDERER_PORT: "5175",
      KIRAKIRA_BROWSER_GATEWAY_PORT: "17383",
    });
    const env = {
      ...renderRuntimeEnv(profile),
      KIRAKIRA_MCP_CONFIG_PATH: ".kirakira/runtime/mcp.json",
    };
    const config = daemonConfigFromEnv(env);

    expect(config.browserGateway?.port).toBe(17383);
    expect(config.browserGateway?.allowedOrigins).toEqual([
      "http://127.0.0.1:5184",
      "http://127.0.0.1:5175",
    ]);
    expect(config.kernel).toEqual({
      workspaceRoot: ".",
      mcpConfigPath: ".kirakira/runtime/mcp.json",
    });
    expect(JSON.stringify(config)).not.toContain("5173");
  });
});
