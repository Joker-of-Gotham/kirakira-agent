import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildRuntimeReadinessPlan,
  expandMcpServerRefs,
  expandRuntimeServiceRefs,
  loadRuntimeProfiles,
  renderComposeArgs,
  renderMcpConfig,
  renderMcpServers,
  renderRuntimeEnv,
  resolveRuntimeProfile,
} from "../../../scripts/runtime-profile.mjs";

const repoRoot = resolve(import.meta.dirname, "..", "..", "..");
const runtimeProfileScript = resolve(repoRoot, "scripts", "runtime-profile.mjs");

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

  it("renders MCP servers from declarative catalog groups", () => {
    const config = {
      schemaVersion: 1,
      defaultProfile: "custom",
      mcpCatalog: {
        defaultServerGroups: ["custom"],
        groups: {
          custom: ["filesystem-core", "local-tool"],
        },
        servers: {
          "filesystem-core": {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-filesystem", { value: "workspaceRoot" }],
          },
          "local-tool": {
            command: "node",
            args: [
              { join: ["appRoot", "packages/custom-mcp/dist/index.js"] },
              "--workspace",
              "{workspaceRoot}",
            ],
            env: {
              KIRAKIRA_PROFILE: "{profileName}",
            },
          },
        },
      },
      profiles: {
        custom: {
          mode: "host",
          workspaceRoot: "/repo",
          appRoot: "/app",
          mcp: {
            workspaceRoot: "/mcp-workspace",
            appRoot: "/mcp-app",
          },
        },
      },
    };

    const profile = resolveRuntimeProfile("custom", config, {});
    const mcp = renderMcpConfig(profile, { config });
    const servers = renderMcpServers(profile, { config });

    expect(expandMcpServerRefs(["@custom"], config)).toEqual(["filesystem-core", "local-tool"]);
    expect(Object.keys(mcp.mcpServers)).toEqual(["filesystem-core", "local-tool"]);
    expect(servers).toEqual(mcp.mcpServers);
    expect(mcp.mcpServers["filesystem-core"].args.at(-1)).toBe("/mcp-workspace");
    expect(mcp.mcpServers["local-tool"].args).toEqual([
      "/mcp-app/packages/custom-mcp/dist/index.js",
      "--workspace",
      "/mcp-workspace",
    ]);
    expect(mcp.mcpServers["local-tool"].env.KIRAKIRA_PROFILE).toBe("custom");
  });

  it("honors profile MCP server refs and overrides", () => {
    const config = {
      schemaVersion: 1,
      defaultProfile: "custom",
      mcpCatalog: {
        defaultServerGroups: ["default"],
        groups: {
          default: ["base"],
        },
        servers: {
          base: {
            command: "node",
            args: ["base.js"],
          },
          custom: {
            command: "node",
            args: ["custom.js", "{workspaceRoot}"],
            env: {
              BASE_ENV: "base",
            },
          },
        },
      },
      profiles: {
        custom: {
          mode: "host",
          workspaceRoot: "/repo",
          appRoot: "/app",
          mcp: {
            workspaceRoot: "/mcp",
            appRoot: "/mcp-app",
            serverRefs: ["custom"],
            serverOverrides: {
              custom: {
                args: ["override.js", { value: "appRoot" }],
                env: {
                  EXTRA_ENV: "{profileName}",
                },
              },
            },
          },
        },
      },
    };

    const profile = resolveRuntimeProfile("custom", config, {});
    const mcp = renderMcpConfig(profile, { config });

    expect(Object.keys(mcp.mcpServers)).toEqual(["custom"]);
    expect(mcp.mcpServers.custom.args).toEqual(["override.js", "/mcp-app"]);
    expect(mcp.mcpServers.custom.env).toEqual({
      BASE_ENV: "base",
      EXTRA_ENV: "custom",
    });
  });

  it("fails clearly for unknown MCP catalog refs and descriptors", () => {
    const config = {
      schemaVersion: 1,
      defaultProfile: "custom",
      mcpCatalog: {
        groups: {},
        servers: {},
      },
      profiles: {
        custom: {
          mode: "host",
          workspaceRoot: ".",
          appRoot: ".",
          mcp: {
            workspaceRoot: ".",
            appRoot: ".",
          },
        },
      },
    };
    const profile = resolveRuntimeProfile("custom", config, {});

    expect(() => expandMcpServerRefs(["@missing"], config)).toThrow(
      'Unknown MCP server group "missing"',
    );
    expect(() => renderMcpServers(profile, { config, serverRefs: ["missing"] })).toThrow(
      'MCP server "missing" is missing a catalog descriptor',
    );
  });

  it("renders env and MCP roots from the selected profile", () => {
    const profile = resolveRuntimeProfile("host", loadRuntimeProfiles());
    const env = renderRuntimeEnv(profile);
    const mcp = renderMcpConfig(profile);

    expect(env.KIRAKIRA_RUNTIME_PROFILE).toBe("host");
    expect(env.KIRAKIRA_MCP_WORKSPACE_ROOT).toBe(".");
    expect(Object.keys(mcp.mcpServers)).toEqual([
      "filesystem-core",
      "filesystem-search",
      "filesystem-git",
      "filesystem-patch",
      "filesystem-artifact",
      "memory",
      "github",
    ]);
    expect(mcp.mcpServers["filesystem-core"].args.at(-1)).toBe(".");
    expect(mcp.mcpServers["filesystem-patch"].args[0]).toBe(
      "packages/mcp-filesystem-patch/dist/index.js",
    );
    expect(mcp.mcpServers["filesystem-patch"].args.at(-1)).toBe(".");
    expect(mcp.mcpServers["filesystem-artifact"].args[0]).toBe(
      "packages/mcp-filesystem-artifact/dist/index.js",
    );
    expect(mcp.mcpServers.memory.args).toEqual(["-y", "@modelcontextprotocol/server-memory"]);
    expect(mcp.mcpServers.github.args).toEqual(["-y", "@modelcontextprotocol/server-github"]);
  });

  it("renders container MCP defaults from the same catalog", () => {
    const profile = resolveRuntimeProfile("container", loadRuntimeProfiles(), {});
    const mcp = renderMcpConfig(profile);

    expect(mcp.mcpServers["filesystem-core"].args.at(-1)).toBe("/workspace");
    expect(mcp.mcpServers["filesystem-patch"].args).toEqual([
      "/app/packages/mcp-filesystem-patch/dist/index.js",
      "--workspace",
      "/workspace",
    ]);
    expect(mcp.mcpServers["filesystem-artifact"].args).toEqual([
      "/app/packages/mcp-filesystem-artifact/dist/index.js",
      "--workspace",
      "/workspace",
    ]);
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

  it("renders container readiness from the runtime service catalog without credentials", () => {
    const config = loadRuntimeProfiles();
    const profile = resolveRuntimeProfile("container", config, {});
    const runtimeServices = expandRuntimeServiceRefs(["@runtime-stack"], config);
    const readiness = buildRuntimeReadinessPlan(profile, { config });

    expect(readiness).toMatchObject({
      schemaVersion: 1,
      profile: "container",
      mode: "container",
      compose: {
        command: "docker",
        args: [
          "compose",
          "-f",
          "docker-compose.yml",
          "--profile",
          "cli",
          "up",
          "-d",
          "--wait",
          ...runtimeServices,
        ],
        services: runtimeServices,
        wait: "running|healthy",
      },
    });
    expect(readiness.checks.filter((check) => check.type === "compose-service").map((check) => check.service))
      .toEqual(runtimeServices);
    expect(JSON.stringify(readiness)).not.toContain("kirakira:kirakira");
    expect(JSON.stringify(readiness)).not.toContain("testpassword");
    expect(JSON.stringify(readiness)).not.toContain("minioadmin");
    expect(JSON.stringify(readiness)).not.toContain("5173");
  });

  it("renders host readiness as external endpoint checks without compose ownership", () => {
    const config = loadRuntimeProfiles();
    const profile = resolveRuntimeProfile("host", config, {});
    const readiness = buildRuntimeReadinessPlan(profile, { config });

    expect(readiness.profile).toBe("host");
    expect(readiness.compose).toBeUndefined();
    expect(readiness.checks).toContainEqual(
      expect.objectContaining({
        name: "service:postgres",
        type: "external-service",
        target: "postgres://127.0.0.1:5432/kirakira",
      }),
    );
    expect(readiness.checks).toContainEqual(
      expect.objectContaining({
        name: "service:kirakirad",
        type: "external-service",
        target: "tcp://127.0.0.1:17777",
      }),
    );
    expect(JSON.stringify(readiness)).not.toContain("kirakira:kirakira");
    expect(JSON.stringify(readiness)).not.toContain("5173");
  });

  it("renders workbench readiness for runtime infra and Kirakira presentation ports", () => {
    const config = loadRuntimeProfiles();
    const profile = resolveRuntimeProfile("workbench-host", config, {});
    const runtimeServices = expandRuntimeServiceRefs(["@runtime-stack"], config);
    const readiness = buildRuntimeReadinessPlan(profile, { config });

    expect(readiness.compose?.args).toEqual([
      "compose",
      "-f",
      "docker-compose.yml",
      "-f",
      "docker-compose.ports.yml",
      "up",
      "-d",
      "--wait",
      ...runtimeServices,
    ]);
    expect(readiness.checks).toContainEqual(
      expect.objectContaining({
        name: "daemon:browser-gateway",
        type: "http-health",
        target: "http://127.0.0.1:17373/healthz",
        endpoint: "ws://127.0.0.1:17373/runtime",
      }),
    );
    expect(readiness.checks).toContainEqual(
      expect.objectContaining({
        name: "presentation:web",
        type: "http",
        target: "http://127.0.0.1:5183/",
      }),
    );
    expect(readiness.checks).toContainEqual(
      expect.objectContaining({
        name: "presentation:desktop",
        type: "http",
        target: "http://127.0.0.1:5174/",
      }),
    );
    expect(JSON.stringify(readiness)).not.toContain("5173");
  });

  it("renders test-host readiness from the memory stack compose file", () => {
    const config = loadRuntimeProfiles();
    const profile = resolveRuntimeProfile("test-host", config, {});
    const memoryServices = expandRuntimeServiceRefs(["@memory-stack"], config);
    const readiness = buildRuntimeReadinessPlan(profile, { config });

    expect(readiness.compose?.args).toEqual([
      "compose",
      "-f",
      "docker-compose.test.yml",
      "up",
      "-d",
      "--wait",
      ...memoryServices,
    ]);
    expect(readiness.checks.map((check) => check.service).filter(Boolean)).toEqual(memoryServices);
    expect(JSON.stringify(readiness)).not.toContain("kirakira:kirakira");
    expect(JSON.stringify(readiness)).not.toContain("5173");
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

  it("renders memory runtime defaults from the declarative profile contract", () => {
    const profile = resolveRuntimeProfile("workbench-host", loadRuntimeProfiles());
    const env = renderRuntimeEnv(profile);

    expect(profile.memory).toMatchObject({
      enabled: true,
      services: ["postgres", "redis", "qdrant", "neo4j", "minio"],
      vector: { backend: "qdrant", urlEnv: "QDRANT_URL" },
      graph: { backend: "neo4j", uriEnv: "NEO4J_URI" },
      blob: {
        backend: "s3",
        endpointEnv: "S3_ENDPOINT",
        bucket: "kirakira-memory",
      },
      embedding: {
        model: "text-embedding-3-small",
        apiKeyEnv: "OPENAI_API_KEY",
      },
      recall: {
        tokenBudget: 4096,
        limit: 8,
        level: "L3",
      },
    });
    expect(env.KIRAKIRA_MEMORY_VECTOR_BACKEND).toBe("qdrant");
    expect(env.KIRAKIRA_MEMORY_GRAPH_BACKEND).toBe("neo4j");
    expect(env.KIRAKIRA_MEMORY_S3_BUCKET).toBe("kirakira-memory");
    expect(env.S3_BUCKET).toBe("kirakira-memory");
    expect(env.KIRAKIRA_MEMORY_EMBEDDING_MODEL).toBe("text-embedding-3-small");
    expect(env.KIRAKIRA_MEMORY_RECALL_TOKEN_BUDGET).toBe("4096");
    expect(env.KIRAKIRA_MEMORY_RECALL_LIMIT).toBe("8");
    expect(env.KIRAKIRA_MEMORY_RECALL_LEVEL).toBe("L3");
    expect(env.KIRAKIRA_MEMORY_ENABLED).toBeUndefined();
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

  it("strictly parses runtime profile CLI arguments", () => {
    const readinessResult = spawnSync(
      process.execPath,
      [runtimeProfileScript, "readiness", "--profile", "workbench-host"],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );
    const readiness = JSON.parse(readinessResult.stdout);

    expect(readinessResult.status).toBe(0);
    expect(readiness.profile).toBe("workbench-host");
    expect(JSON.stringify(readiness)).not.toContain("5173");

    const extraArgResult = spawnSync(
      process.execPath,
      [runtimeProfileScript, "env", "workbench-host", "extra"],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );

    expect(extraArgResult.status).toBe(1);
    expect(extraArgResult.stderr).toContain("Unknown runtime profile argument");
  });
});
