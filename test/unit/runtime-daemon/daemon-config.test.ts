import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
    const config = daemonConfigFromEnv(env, { loadResolvedConfig: false });

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
    const config = daemonConfigFromEnv(env, { loadResolvedConfig: false });

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

  it("loads resolved project config and projects orchestration into kernel options", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "kirakira-daemon-config-"));
    const runtimeProfiles = loadRuntimeProfiles();
    await writeFile(
      join(workspaceRoot, "agent.toml"),
      [
        "schema_version = 1",
        "",
        "[model]",
        'default = "profile-model"',
        "",
        "[mcp]",
        'config_files = [ ".mcp.profile.json" ]',
        "",
        "[orchestration]",
        "max_concurrency = 3",
        "default_subagent_turns = 9",
        'subagent_system_preamble = "Profile scoped daemon supervisor."',
        "",
        "[deep_research]",
        "enabled = true",
        'source_policy = "workspace"',
        "max_depth = 2",
        "max_breadth = 2",
        "max_tool_calls = 5",
        "require_citations = true",
        'workspace_dir = ".kirakira/research"',
        "",
      ].join("\n"),
      "utf8",
    );

    try {
      const profile = resolveRuntimeProfile("workbench-host", runtimeProfiles, {
        KIRAKIRA_WORKSPACE_ROOT: workspaceRoot,
      });
      const env = renderRuntimeEnv(profile);
      const config = daemonConfigFromEnv(env, {
        runtimeProfilesConfig: runtimeProfiles,
        skipSystemLayer: true,
        skipUserLayer: true,
      });

      expect(config.kernel?.workspaceRoot).toBe(workspaceRoot);
      expect(config.kernel?.mcpConfigPath).toBe(".mcp.profile.json");
      expect(config.kernel?.resolvedConfig?.agentToml.deep_research).toMatchObject({
        enabled: true,
        source_policy: "workspace",
        max_depth: 2,
      });
      expect(config.kernel?.resolvedConfig?.runtimeState?.profiles).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "workbench-host",
            mcp_servers: expect.arrayContaining([
              expect.objectContaining({ name: "filesystem-core" }),
              expect.objectContaining({ name: "filesystem-artifact" }),
              expect.objectContaining({ name: "memory" }),
            ]),
          }),
        ]),
      );
      expect(config.kernel?.kernelOptions?.laneCapacities).toEqual({
        delegated: 3,
      });
      expect(config.kernel?.kernelOptions?.parentWorkerDefaults).toEqual({
        model: "profile-model",
        systemPrompt: "Profile scoped daemon supervisor.",
        maxTurns: 9,
      });
      expect(config.kernel?.kernelOptions?.planContext).toMatchObject({
        workspace: workspaceRoot,
        availableMcpServers: expect.arrayContaining([
          "filesystem-core",
          "filesystem-artifact",
          "memory",
        ]),
      });
      expect(config.kernel?.memory?.env).toMatchObject({
        KIRAKIRA_WORKSPACE_ROOT: workspaceRoot,
        DATABASE_URL: expect.any(String),
        REDIS_URL: expect.any(String),
        QDRANT_URL: expect.any(String),
        NEO4J_URI: expect.any(String),
        S3_ENDPOINT: expect.any(String),
        KIRAKIRA_MEMORY_VECTOR_BACKEND: "qdrant",
        KIRAKIRA_MEMORY_RECALL_LEVEL: "L3",
      });
      expect(config.browserGateway?.allowedOrigins).toEqual([
        "http://127.0.0.1:5183",
        "http://127.0.0.1:5174",
      ]);
      expect(JSON.stringify(config)).not.toContain("5173");
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});
