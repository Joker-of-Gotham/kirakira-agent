import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildResolvedRuntimeProfileProjection,
  selectResolvedRuntimeProfile,
} from "../../../packages/config-resolver/src/runtime-projection.js";
import { resolveConfig } from "../../../packages/config-resolver/src/resolved-state.js";
import type { ConfigLayer } from "../../../packages/config-resolver/src/types.js";
import { getRepoRoot } from "../../helpers/repo-root.js";

const root = getRepoRoot(import.meta.url);
const runtimeProfilesPath = join(root, "configs", "runtime", "profiles.json");

function runtimeProfilesConfig() {
  return JSON.parse(readFileSync(runtimeProfilesPath, "utf-8")) as Record<string, unknown>;
}

function repoLayer(data: ConfigLayer["data"] = {}): ConfigLayer {
  return {
    name: "repo",
    path: join(root, "agent.toml"),
    data,
  };
}

describe("resolved runtime state", () => {
  it("projects runtime profile catalogs into resolved config state", () => {
    const resolved = resolveConfig([repoLayer()], undefined, undefined, {
      runtimeProfilesConfig: runtimeProfilesConfig(),
      runtimeProfilesPath,
      runtimeEnv: {},
    });

    const runtime = resolved.runtimeState;
    const container = runtime?.profiles.find((profile) => profile.name === "container");
    const workbench = runtime?.profiles.find((profile) => profile.name === "workbench-host");

    expect(resolved.configPaths.runtimeProfiles).toBe(runtimeProfilesPath);
    expect(runtime?.default_profile).toBe("container");
    expect(runtime?.service_catalog?.groups?.["runtime-stack"]).toEqual([
      "postgres",
      "redis",
      "qdrant",
      "neo4j",
      "minio",
      "kirakirad",
    ]);
    expect(runtime?.mcp_catalog?.servers).toEqual([
      "filesystem-core",
      "filesystem-search",
      "filesystem-git",
      "filesystem-patch",
      "filesystem-artifact",
      "memory",
      "github",
    ]);

    expect(container?.workspace_root).toBe("/workspace");
    expect(container?.runtime_services).toEqual(runtime?.service_catalog?.groups?.["runtime-stack"]);
    expect(container?.mcp_servers?.find((server) => server.name === "filesystem-core")?.args?.at(-1))
      .toBe("/workspace");
    expect(container?.mcp_servers?.find((server) => server.name === "filesystem-patch")?.args?.[0])
      .toBe("/app/packages/mcp-filesystem-patch/dist/index.js");

    expect(workbench?.workbench_infra_services).toEqual(runtime?.service_catalog?.groups?.["runtime-stack"]);
    expect(workbench?.presentation?.web?.url).toBe("http://127.0.0.1:5183");
    expect(workbench?.presentation?.desktop?.renderer_url).toBe("http://127.0.0.1:5174");
    expect(workbench?.browser_gateway?.endpoint).toBe("ws://127.0.0.1:17373/runtime");
    expect(workbench?.orchestration).toMatchObject({
      handoff_mode: "swarm",
      default_role: "supervisor",
      lanes: {
        foreground: { capacity: 2 },
        queued: { capacity: 8 },
        background: { capacity: 4 },
        delegated: { capacity: 4 },
      },
      roles: expect.arrayContaining([
        expect.objectContaining({
          id: "supervisor",
          lane: "foreground",
          permissions: ["plan", "delegate", "synthesize"],
        }),
        expect.objectContaining({
          id: "implementer",
          lane: "delegated",
          context: "isolated",
        }),
      ]),
      handoffs: expect.arrayContaining([
        expect.objectContaining({
          from: "supervisor",
          to: "researcher",
          input_filter: "question-and-source-policy",
        }),
        expect.objectContaining({
          from: "supervisor",
          to: "implementer",
          conditions: ["bounded-write-set", "parallelizable"],
        }),
      ]),
    });
    expect(workbench?.memory).toMatchObject({
      enabled: true,
      services: [
        expect.objectContaining({ name: "postgres", url_env: "DATABASE_URL" }),
        expect.objectContaining({ name: "redis", url_env: "REDIS_URL" }),
        expect.objectContaining({ name: "qdrant", url_env: "QDRANT_URL" }),
        expect.objectContaining({ name: "neo4j", url_env: "NEO4J_URI" }),
        expect.objectContaining({ name: "minio", url_env: "S3_ENDPOINT" }),
      ],
      vector: {
        backend: "qdrant",
        url_env: "QDRANT_URL",
        api_key_env: "QDRANT_API_KEY",
        collection: "kirakira_memory",
      },
      graph: {
        backend: "neo4j",
        uri_env: "NEO4J_URI",
        username_env: "KIRAKIRA_NEO4J_USER",
        password_env: "KIRAKIRA_NEO4J_PASSWORD",
      },
      blob: {
        backend: "s3",
        endpoint_env: "S3_ENDPOINT",
        bucket: "kirakira-memory",
        region: "us-east-1",
        access_key_id_env: "S3_ACCESS_KEY_ID",
        secret_access_key_env: "S3_SECRET_ACCESS_KEY",
      },
      embedding: {
        model: "text-embedding-3-small",
        api_key_env: "OPENAI_API_KEY",
        base_url_env: "OPENAI_BASE_URL",
      },
      recall: {
        token_budget: 4096,
        limit: 8,
        level: "L3",
      },
    });
    expect(workbench?.mcp_servers?.find((server) => server.name === "filesystem-patch")?.args?.[0])
      .toBe("packages/mcp-filesystem-patch/dist/index.js");
    expect(JSON.stringify(runtime)).not.toContain("5173");
  });

  it("applies runtime env overrides to projected profile state", () => {
    const resolved = resolveConfig([repoLayer()], undefined, undefined, {
      runtimeProfilesConfig: runtimeProfilesConfig(),
      runtimeProfilesPath,
      runtimeEnv: {
        KIRAKIRA_WEB_PORT: "5184",
        KIRAKIRA_DESKTOP_RENDERER_PORT: "5175",
        KIRAKIRA_BROWSER_GATEWAY_PORT: "17383",
        KIRAKIRA_MCP_WORKSPACE_ROOT: "/custom-mcp-workspace",
        KIRAKIRA_MCP_APP_ROOT: "/custom-mcp-app",
      },
    });

    const workbench = resolved.runtimeState?.profiles.find((profile) => profile.name === "workbench-host");

    expect(workbench?.presentation?.web?.url).toBe("http://127.0.0.1:5184");
    expect(workbench?.presentation?.desktop?.renderer_url).toBe("http://127.0.0.1:5175");
    expect(workbench?.browser_gateway?.endpoint).toBe("ws://127.0.0.1:17383/runtime");
    expect(workbench?.mcp_workspace_root).toBe("/custom-mcp-workspace");
    expect(workbench?.mcp_app_root).toBe("/custom-mcp-app");
    expect(workbench?.mcp_servers?.find((server) => server.name === "filesystem-core")?.args?.at(-1))
      .toBe("/custom-mcp-workspace");
  });

  it("builds resolved MCP and memory-stack startup fragments without local config files", () => {
    const resolved = resolveConfig([repoLayer()], undefined, undefined, {
      runtimeProfilesConfig: runtimeProfilesConfig(),
      runtimeProfilesPath,
      runtimeEnv: {},
    });

    const projection = buildResolvedRuntimeProfileProjection(resolved.runtimeState, "container");
    const memoryServices = resolved.runtimeState.service_catalog?.groups?.["memory-stack"] ?? [];
    const runtimeServices = resolved.runtimeState.service_catalog?.groups?.["runtime-stack"] ?? [];

    expect(projection.fragments.mcpConfig.config.mcpServers["filesystem-core"].args?.at(-1))
      .toBe("/workspace");
    expect(projection.fragments.mcpConfig.config.mcpServers["filesystem-patch"].args?.[0])
      .toBe("/app/packages/mcp-filesystem-patch/dist/index.js");
    expect(projection.fragments.readiness.compose?.args).toEqual([
      "compose",
      "-f",
      "docker-compose.yml",
      "--profile",
      "cli",
      "up",
      "-d",
      "--wait",
      ...runtimeServices,
    ]);
    expect(projection.fragments.memoryStack.compose?.args).toEqual([
      "compose",
      "-f",
      "docker-compose.yml",
      "--profile",
      "cli",
      "up",
      "-d",
      "--wait",
      ...memoryServices,
    ]);
    expect(projection.fragments.memoryStack.services.map((service) => service.name))
      .toEqual(memoryServices);
    expect(projection.fragments.env).toMatchObject({
      profile: "container",
      source: "resolved-runtime-state.env",
      values: {
        KIRAKIRA_RUNTIME_PROFILE: "container",
        KIRAKIRA_WORKSPACE_ROOT: "/workspace",
        KIRAKIRA_APP_ROOT: "/app",
        KIRAKIRA_MCP_WORKSPACE_ROOT: "/workspace",
        KIRAKIRA_MCP_APP_ROOT: "/app",
      },
    });
    expect(projection.fragments.env.variables).toContainEqual({
      name: "DATABASE_URL",
      generated: false,
    });
    expect(projection.fragments.startup).toMatchObject({
      profile: "container",
      source: "resolved-runtime-state.startup",
      compose: projection.fragments.readiness.compose,
      mcp: {
        roots: {
          workspaceRoot: "/workspace",
          appRoot: "/app",
        },
        servers: [
          "filesystem-core",
          "filesystem-search",
          "filesystem-git",
          "filesystem-patch",
          "filesystem-artifact",
          "memory",
          "github",
        ],
      },
      memory: {
        enabled: true,
        services: memoryServices,
        env: expect.arrayContaining(["DATABASE_URL", "QDRANT_URL", "S3_ENDPOINT"]),
      },
    });
    expect(projection.services.find((service) => service.name === "postgres")).toMatchObject({
      composeService: "postgres",
      sources: ["services", "readiness", "memory-stack"],
      endpoint: {
        urlEnv: "DATABASE_URL",
      },
      readiness: {
        name: "service:postgres",
        type: "compose-service",
        urlEnv: "DATABASE_URL",
      },
      memoryStack: {
        enabled: true,
        urlEnv: "DATABASE_URL",
        env: ["DATABASE_URL"],
      },
    });
    expect(projection.services.find((service) => service.name === "kirakirad")).toMatchObject({
      sources: ["services", "readiness"],
      readiness: {
        name: "service:kirakirad",
        type: "compose-service",
        urlEnv: "KIRAKIRA_PDP_ENDPOINT",
      },
    });
    expect(projection.services.find((service) => service.name === "kirakirad")?.memoryStack)
      .toBeUndefined();
    expect(projection.mcp.servers).toContainEqual(
      expect.objectContaining({
        name: "filesystem-core",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"],
      }),
    );
    expect(projection.mcp.config.mcpServers["filesystem-core"].args?.at(-1))
      .toBe("/workspace");
    expect(JSON.stringify(projection)).not.toContain(".mcp.json");
    expect(JSON.stringify(projection)).not.toContain("kirakira:kirakira");
  });

  it("selects the default resolved runtime profile for host-only consumers", () => {
    const resolved = resolveConfig([repoLayer()], undefined, undefined, {
      runtimeProfilesConfig: {
        ...runtimeProfilesConfig(),
        defaultProfile: "host",
      },
      runtimeProfilesPath,
      runtimeEnv: {},
    });

    const profile = selectResolvedRuntimeProfile(resolved.runtimeState);
    const projection = buildResolvedRuntimeProfileProjection(resolved.runtimeState);

    expect(profile.name).toBe("host");
    expect(projection.profile).toBe("host");
    expect(projection.fragments.readiness.compose).toBeUndefined();
    expect(projection.fragments.memoryStack.compose).toBeUndefined();
    expect(projection.services.find((service) => service.name === "postgres")).toMatchObject({
      composeService: "postgres",
      readiness: {
        type: "external-service",
        urlEnv: "DATABASE_URL",
      },
      memoryStack: {
        enabled: true,
        urlEnv: "DATABASE_URL",
      },
    });
    expect(projection.fragments.memoryStack.env).toContainEqual({
      name: "DATABASE_URL",
      generated: false,
    });
    expect(projection.fragments.startup.memory).toMatchObject({
      enabled: true,
      services: expect.arrayContaining(["postgres", "redis", "qdrant", "neo4j", "minio"]),
    });
  });

  it("projects resolved workbench startup surfaces and memory-disabled profiles", () => {
    const disabledRuntime = runtimeProfilesConfig();
    const profiles = disabledRuntime.profiles as Record<string, Record<string, unknown>>;
    profiles.host = {
      ...profiles.host,
      memory: {
        enabled: false,
      },
    };

    const resolved = resolveConfig([repoLayer()], undefined, undefined, {
      runtimeProfilesConfig: disabledRuntime,
      runtimeProfilesPath,
      runtimeEnv: {},
    });
    const workbench = buildResolvedRuntimeProfileProjection(resolved.runtimeState, "workbench-host");
    const host = buildResolvedRuntimeProfileProjection(resolved.runtimeState, "host");

    expect(workbench.fragments.startup.surfaces?.web.steps.map((step) => step.name)).toEqual([
      "daemon",
      "web",
    ]);
    expect(workbench.fragments.startup.surfaces?.web.steps.at(-1)).toMatchObject({
      name: "web",
      kind: "presentation",
      waitFor: ["daemon:browser-gateway"],
      readiness: ["presentation:web"],
    });
    expect(workbench.fragments.startup.surfaces?.desktop.steps.map((step) => step.name)).toEqual([
      "daemon",
      "desktop-renderer",
      "desktop-shell",
    ]);
    expect(workbench.fragments.startup.surfaces?.desktop.steps.at(-1)).toMatchObject({
      name: "desktop-shell",
      waitFor: ["daemon:browser-gateway"],
      readiness: ["presentation:desktop"],
    });
    expect(host.fragments.memoryStack).toMatchObject({
      enabled: false,
      services: [],
      env: [],
    });
    expect(host.fragments.startup.memory).toEqual({
      enabled: false,
      services: [],
      compose: undefined,
      env: [],
    });
  });

  it("includes runtime profile state in the resolved fingerprint", () => {
    const baseRuntime = runtimeProfilesConfig();
    const changedRuntime = {
      ...baseRuntime,
      defaultProfile: "host",
    };

    const base = resolveConfig([repoLayer()], undefined, undefined, {
      runtimeProfilesConfig: baseRuntime,
      runtimeProfilesPath,
      runtimeEnv: {},
    });
    const changed = resolveConfig([repoLayer()], undefined, undefined, {
      runtimeProfilesConfig: changedRuntime,
      runtimeProfilesPath,
      runtimeEnv: {},
    });

    expect(base.fingerprint).not.toBe(changed.fingerprint);
    expect(changed.runtimeState?.default_profile).toBe("host");
  });
});
