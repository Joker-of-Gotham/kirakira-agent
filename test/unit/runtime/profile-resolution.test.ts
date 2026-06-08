import { describe, expect, it } from "vitest";
import {
  expandRuntimeServiceRefs,
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

  it("expands service catalog groups into container and workbench runtime surfaces", () => {
    const config = loadRuntimeProfiles();

    expect(expandRuntimeServiceRefs(["@runtime-stack"], config)).toEqual([
      "postgres",
      "redis",
      "qdrant",
      "neo4j",
      "minio",
      "kirakirad",
    ]);
    expect(expandRuntimeServiceRefs(["@memory-stack"], config)).toEqual([
      "postgres",
      "redis",
      "qdrant",
      "neo4j",
      "minio",
    ]);

    const container = resolveRuntimeProfile("container", config, {});
    const workbench = resolveRuntimeProfile("workbench-host", config, {});

    expect(Object.keys(container.services ?? {})).toEqual([
      "postgres",
      "redis",
      "qdrant",
      "neo4j",
      "minio",
      "kirakirad",
    ]);
    expect(container.containerStartup.runtimeServices).toEqual([
      "postgres",
      "redis",
      "qdrant",
      "neo4j",
      "minio",
      "kirakirad",
    ]);
    expect(workbench.workbench.infraServices).toEqual(container.containerStartup.runtimeServices);
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
    if (process.platform === "win32") {
      expect(env.KIRAKIRA_DAEMON_SOCKET).toMatch(/^\\\\\.\\pipe\\kirakira-agent-daemon-/u);
    } else {
      expect(env.KIRAKIRA_DAEMON_SOCKET).toBe(".kirakira/runtime/daemon.sock");
    }
    expect(env.KIRAKIRA_BROWSER_GATEWAY_ENABLED).toBe("1");
    expect(env.VITE_KIRAKIRA_RUNTIME_MODE).toBe("gateway");
    expect(env.VITE_KIRAKIRA_GATEWAY_URL).toBe("ws://127.0.0.1:17373/runtime");
    expect(env.KIRAKIRA_WEB_URL).toBe("http://127.0.0.1:5183");
    expect(env.KIRAKIRA_DESKTOP_RENDERER_URL).toBe("http://127.0.0.1:5174");
    expect(env.KIRAKIRA_DESKTOP_DEV_URL).toBe("http://127.0.0.1:5174");
  });

  it("keeps container service URLs on internal ports when host published ports are overridden", () => {
    const profile = resolveRuntimeProfile("container", loadRuntimeProfiles(), {
      KIRAKIRA_POSTGRES_PORT: "15432",
      KIRAKIRA_REDIS_PORT: "16379",
      KIRAKIRA_QDRANT_HTTP_PORT: "16333",
      KIRAKIRA_NEO4J_BOLT_PORT: "17687",
      KIRAKIRA_MINIO_API_PORT: "19000",
    });
    const env = renderRuntimeEnv(profile);

    expect(env.DATABASE_URL).toBe("postgres://kirakira:kirakira@postgres:5432/kirakira");
    expect(env.REDIS_URL).toBe("redis://redis:6379");
    expect(env.QDRANT_URL).toBe("http://qdrant:6333");
    expect(env.NEO4J_URI).toBe("bolt://neo4j:7687");
    expect(env.S3_ENDPOINT).toBe("http://minio:9000");
  });

  it("resolves host service URLs from catalog-published port metadata", () => {
    const profile = resolveRuntimeProfile("host", loadRuntimeProfiles(), {
      KIRAKIRA_POSTGRES_PORT: "15432",
      KIRAKIRA_KIRAKIRAD_PDP_PORT: "17778",
    });
    const env = renderRuntimeEnv(profile);

    expect(env.DATABASE_URL).toBe("postgres://kirakira:kirakira@127.0.0.1:15432/kirakira");
    expect(env.KIRAKIRA_PDP_ENDPOINT).toBe("tcp://127.0.0.1:17778");
    expect(env.REDIS_URL).toBe("redis://127.0.0.1:6379");
  });

  it("renders workbench presentation and gateway URLs from endpoint port overrides", () => {
    const profile = resolveRuntimeProfile("workbench-host", loadRuntimeProfiles(), {
      KIRAKIRA_WEB_PORT: "5184",
      KIRAKIRA_DESKTOP_RENDERER_PORT: "5175",
      KIRAKIRA_BROWSER_GATEWAY_PORT: "17383",
    });
    const env = renderRuntimeEnv(profile);

    expect(env.KIRAKIRA_WEB_URL).toBe("http://127.0.0.1:5184");
    expect(env.KIRAKIRA_DESKTOP_RENDERER_URL).toBe("http://127.0.0.1:5175");
    expect(env.KIRAKIRA_DESKTOP_DEV_URL).toBe("http://127.0.0.1:5175");
    expect(env.VITE_KIRAKIRA_GATEWAY_URL).toBe("ws://127.0.0.1:17383/runtime");
    expect(env.KIRAKIRA_BROWSER_GATEWAY_ALLOWED_ORIGINS).toBe(
      "http://127.0.0.1:5184,http://127.0.0.1:5175",
    );
    expect(JSON.stringify(env)).not.toContain("5173");
  });

  it("renders service env and aliases from declarative bindings", () => {
    const config = {
      schemaVersion: 1,
      defaultProfile: "custom",
      envBindings: {
        services: {
          customStore: "CUSTOM_STORE_URL",
        },
        values: {
          "daemon.browserGateway.token": ["KIRAKIRA_GATEWAY_TOKEN_ALIAS", "VITE_GATEWAY_TOKEN_ALIAS"],
          "presentation.web.url": "CUSTOM_WEB_URL",
        },
        booleans: {
          "daemon.browserGateway.enabled": {
            env: "CUSTOM_GATEWAY_ENABLED",
            true: "yes",
            false: "no",
          },
        },
        joined: {
          "daemon.browserGateway.allowedOrigins": {
            env: "CUSTOM_GATEWAY_ORIGINS",
            separator: "|",
          },
        },
        computed: {
          browserGatewayEndpoint: {
            source: "daemon.browserGateway",
            urlEnv: "CUSTOM_GATEWAY_URL",
            modeEnv: "CUSTOM_RUNTIME_MODE",
            mode: "custom-gateway",
          },
        },
      },
      profiles: {
        custom: {
          mode: "host",
          workspaceRoot: ".",
          appRoot: ".",
          services: {
            customStore: "custom://store",
          },
          daemon: {
            browserGateway: {
              enabled: true,
              endpoint: "ws://127.0.0.1:18080/custom",
              token: "test-token",
              allowedOrigins: ["http://127.0.0.1:9001", "http://127.0.0.1:9002"],
            },
          },
          presentation: {
            web: {
              url: "http://127.0.0.1:9001",
            },
          },
          mcp: {
            workspaceRoot: ".",
            appRoot: ".",
          },
        },
      },
    };

    const profile = resolveRuntimeProfile("custom", config);
    const env = renderRuntimeEnv(profile);

    expect(env.CUSTOM_STORE_URL).toBe("custom://store");
    expect(env.CUSTOM_GATEWAY_ENABLED).toBe("yes");
    expect(env.CUSTOM_GATEWAY_URL).toBe("ws://127.0.0.1:18080/custom");
    expect(env.CUSTOM_RUNTIME_MODE).toBe("custom-gateway");
    expect(env.CUSTOM_GATEWAY_ORIGINS).toBe(
      "http://127.0.0.1:9001|http://127.0.0.1:9002",
    );
    expect(env.KIRAKIRA_GATEWAY_TOKEN_ALIAS).toBe("test-token");
    expect(env.VITE_GATEWAY_TOKEN_ALIAS).toBe("test-token");
    expect(env.CUSTOM_WEB_URL).toBe("http://127.0.0.1:9001");
  });
});
