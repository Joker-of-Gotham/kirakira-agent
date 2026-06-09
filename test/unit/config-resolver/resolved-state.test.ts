import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
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
