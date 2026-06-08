import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ensureMcpConfig } from "../../../scripts/kirakira-common.mjs";
import { buildWorkbenchPlan, profileFromOptions } from "../../../scripts/kirakira-workbench.mjs";
import {
  expandRuntimeServiceRefs,
  loadRuntimeProfiles,
  renderRuntimeEnv,
  resolveRuntimeProfile,
} from "../../../scripts/runtime-profile.mjs";

describe("workbench launcher plan", () => {
  it("plans infra, daemon, and web from the workbench profile", () => {
    const config = loadRuntimeProfiles();
    const profile = resolveRuntimeProfile("workbench-host", config, {});
    const plan = buildWorkbenchPlan(profile, "web");
    const expectedInfraServices = expandRuntimeServiceRefs(["@runtime-stack"], config);

    expect(plan.profile).toBe("workbench-host");
    expect(plan.steps.map((step) => step.name)).toEqual(["infra", "daemon", "web"]);
    expect(plan.steps[0]).toMatchObject({
      command: "docker",
      args: [
        "compose",
        "-f",
        "docker-compose.yml",
        "-f",
        "docker-compose.ports.yml",
        "up",
        "-d",
        "--wait",
        ...expectedInfraServices,
      ],
    });
    expect(plan.steps[1]).toMatchObject({
      name: "daemon",
      mode: "background",
      args: ["--filter", "@kirakira/runtime-daemon", "start"],
    });
    expect(plan.steps[2]).toMatchObject({
      name: "web",
      mode: "foreground",
      args: ["--filter", "@kirakira/web", "dev"],
    });
    expect(plan.env.VITE_KIRAKIRA_GATEWAY_URL).toBe("ws://127.0.0.1:17373/runtime");
    expect(JSON.stringify(plan)).not.toContain("5173");
  });

  it("can plan a daemon-only startup without UI or implicit infra", () => {
    const profile = resolveRuntimeProfile("workbench-host", loadRuntimeProfiles(), {});
    const plan = buildWorkbenchPlan(profile, "daemon", { skipInfra: true });

    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]).toMatchObject({
      name: "daemon",
      mode: "foreground",
      args: ["--filter", "@kirakira/runtime-daemon", "start"],
    });
  });

  it("plans new workbench surfaces from profile configuration", () => {
    const profile = resolveRuntimeProfile("workbench-host", loadRuntimeProfiles(), {});
    const configurableProfile = {
      ...profile,
      workbench: {
        ...profile.workbench,
        packages: {
          ...profile.workbench.packages,
          inspector: {
            package: "@kirakira/web",
            script: "typecheck",
          },
        },
        surfaces: {
          ...profile.workbench.surfaces,
          inspector: [
            {
              package: "inspector",
              mode: "foreground",
            },
          ],
        },
      },
    };

    const plan = buildWorkbenchPlan(configurableProfile, "inspector", { skipInfra: true });

    expect(plan.surface).toBe("inspector");
    expect(plan.steps).toEqual([
      {
        name: "inspector",
        mode: "foreground",
        command: process.platform === "win32" ? "pnpm.cmd" : "pnpm",
        args: ["--filter", "@kirakira/web", "typecheck"],
        env: plan.env,
      },
    ]);
  });

  it("uses the profile default surface when no surface is requested", () => {
    const profile = resolveRuntimeProfile("workbench-host", loadRuntimeProfiles(), {});
    const plan = buildWorkbenchPlan(profile, undefined, { skipInfra: true, skipDaemon: true });

    expect(plan.surface).toBe("web");
    expect(plan.steps.map((step) => step.name)).toEqual(["web"]);
  });

  it("does not let generic root env override the selected workbench profile", () => {
    const profile = profileFromOptions(
      {},
      {
        KIRAKIRA_WORKBENCH_PROFILE: "workbench-host",
        KIRAKIRA_RUNTIME_PROFILE: "container",
        KIRAKIRA_WORKSPACE_ROOT: "/workspace",
        KIRAKIRA_APP_ROOT: "/app",
        KIRAKIRA_MCP_WORKSPACE_ROOT: "/workspace",
        KIRAKIRA_MCP_APP_ROOT: "/app",
      },
    );

    expect(profile.name).toBe("workbench-host");
    expect(profile.workspaceRoot).toBe(".");
    expect(profile.appRoot).toBe(".");
    expect(profile.mcp.workspaceRoot).toBe(".");
    expect(profile.mcp.appRoot).toBe(".");
  });

  it("keeps profile-scoped endpoint overrides for workbench startup", () => {
    const profile = profileFromOptions(
      {},
      {
        KIRAKIRA_WORKBENCH_PROFILE: "workbench-host",
        KIRAKIRA_RUNTIME_PROFILE: "container",
        KIRAKIRA_WORKSPACE_ROOT: "/workspace",
        KIRAKIRA_WEB_PORT: "5184",
        KIRAKIRA_DESKTOP_RENDERER_PORT: "5175",
        KIRAKIRA_BROWSER_GATEWAY_PORT: "17383",
        KIRAKIRA_POSTGRES_PORT: "15432",
      },
    );
    const env = renderRuntimeEnv(profile);
    const plan = buildWorkbenchPlan(profile, "web");

    expect(profile.workspaceRoot).toBe(".");
    expect(env.KIRAKIRA_WEB_URL).toBe("http://127.0.0.1:5184");
    expect(env.KIRAKIRA_DESKTOP_RENDERER_URL).toBe("http://127.0.0.1:5175");
    expect(env.VITE_KIRAKIRA_GATEWAY_URL).toBe("ws://127.0.0.1:17383/runtime");
    expect(env.KIRAKIRA_POSTGRES_PORT).toBe("15432");
    expect(plan.env.KIRAKIRA_WEB_URL).toBe("http://127.0.0.1:5184");
    expect(plan.steps[0]?.env.KIRAKIRA_POSTGRES_PORT).toBe("15432");
    expect(JSON.stringify({ env, plan })).not.toContain("5173");
  });

  it("renders MCP roots from the resolved workbench profile despite container .env defaults", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "kirakira-mcp-"));
    const envKeys = [
      "KIRAKIRA_RUNTIME_PROFILE",
      "KIRAKIRA_WORKSPACE_ROOT",
      "KIRAKIRA_APP_ROOT",
      "KIRAKIRA_MCP_WORKSPACE_ROOT",
      "KIRAKIRA_MCP_APP_ROOT",
    ];
    const previousEnv = new Map(envKeys.map((key) => [key, process.env[key]]));

    try {
      for (const key of envKeys) delete process.env[key];
      writeFileSync(
        join(tempRoot, ".env"),
        [
          "KIRAKIRA_RUNTIME_PROFILE=container",
          "KIRAKIRA_WORKSPACE_ROOT=/workspace",
          "KIRAKIRA_APP_ROOT=/app",
          "KIRAKIRA_MCP_WORKSPACE_ROOT=/workspace",
          "KIRAKIRA_MCP_APP_ROOT=/app",
          "",
        ].join("\n"),
        "utf8",
      );

      const profile = resolveRuntimeProfile("workbench-host", loadRuntimeProfiles(), {});
      ensureMcpConfig(tempRoot, profile);
      const mcp = JSON.parse(readFileSync(join(tempRoot, ".mcp.json"), "utf8"));

      expect(mcp.mcpServers["filesystem-core"].args.at(-1)).toBe(".");
      expect(mcp.mcpServers["filesystem-patch"].args.at(-1)).toBe(".");
      expect(mcp.mcpServers["filesystem-artifact"].args.at(-1)).toBe(".");
    } finally {
      for (const [key, value] of previousEnv) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("fails loudly for unknown surfaces and package references", () => {
    const profile = resolveRuntimeProfile("workbench-host", loadRuntimeProfiles(), {});

    expect(() => buildWorkbenchPlan(profile, "unknown", { skipInfra: true })).toThrow(
      /Unknown workbench surface "unknown"/u,
    );

    expect(() =>
      buildWorkbenchPlan(
        {
          ...profile,
          workbench: {
            ...profile.workbench,
            surfaces: {
              broken: [{ package: "missing", mode: "foreground" }],
            },
          },
        },
        "broken",
        { skipInfra: true },
      ),
    ).toThrow(/Workbench package step "missing" is not defined/u);
  });
});
