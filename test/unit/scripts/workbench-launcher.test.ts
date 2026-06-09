import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ensureMcpConfig } from "../../../scripts/kirakira-common.mjs";
import {
  buildWorkbenchPlan,
  buildWorkbenchSmokePlan,
  profileFromOptions,
  readinessPlanForCheckNames,
  resolveWorkbenchSmokeContract,
  runWorkbenchPlan,
  waitForReadinessChecks,
  WORKBENCH_ELECTRON_SMOKE_ENV,
  WorkbenchProcessSupervisor,
} from "../../../scripts/kirakira-workbench.mjs";
import {
  buildRuntimeSurfaceStartupPlan,
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
    const sharedPlan = buildRuntimeSurfaceStartupPlan(profile, "web", {
      includeExecutionEnv: true,
    });
    const expectedInfraServices = expandRuntimeServiceRefs(["@runtime-stack"], config);

    expect(plan).toEqual(sharedPlan);
    expect(plan.profile).toBe("workbench-host");
    expect(plan.source).toBe("runtime-profile.startup.surface");
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
    expect(plan.readiness.compose?.args).toEqual(plan.steps[0]?.args);
    expect(plan.readiness.checks).toContainEqual(
      expect.objectContaining({
        name: "daemon:browser-gateway",
        target: "http://127.0.0.1:17373/healthz",
      }),
    );
    expect(plan.readiness.checks).toContainEqual(
      expect.objectContaining({
        name: "presentation:web",
        target: "http://127.0.0.1:5183/",
      }),
    );
    expect(plan.steps[1]).toMatchObject({
      name: "daemon",
      mode: "background",
      args: ["--filter", "@kirakira/runtime-daemon", "start"],
    });
    expect(plan.steps[2]).toMatchObject({
      name: "web",
      mode: "foreground",
      args: ["--filter", "@kirakira/web", "dev"],
      waitFor: ["daemon:browser-gateway"],
    });
    expect(plan.env.VITE_KIRAKIRA_GATEWAY_URL).toBe("ws://127.0.0.1:17373/runtime");
    expect(JSON.stringify(plan)).not.toContain("5173");
  });

  it("plans daemon, renderer, and Electron shell for the desktop surface", () => {
    const config = loadRuntimeProfiles();
    const profile = resolveRuntimeProfile("workbench-host", config, {});
    const plan = buildWorkbenchPlan(profile, "desktop");
    const expectedInfraServices = expandRuntimeServiceRefs(["@runtime-stack"], config);

    expect(plan.profile).toBe("workbench-host");
    expect(plan.surface).toBe("desktop");
    expect(plan.steps.map((step) => step.name)).toEqual([
      "infra",
      "daemon",
      "desktop-renderer",
      "desktop-shell",
    ]);
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
      name: "desktop-renderer",
      mode: "background",
      args: ["--filter", "@kirakira/desktop", "dev:renderer"],
    });
    expect(plan.steps[3]).toMatchObject({
      name: "desktop-shell",
      mode: "foreground",
      args: ["--filter", "@kirakira/desktop", "dev:electron"],
      waitFor: ["daemon:socket", "daemon:browser-gateway", "presentation:desktop"],
    });
    expect(plan.env.KIRAKIRA_DESKTOP_RENDERER_URL).toBe("http://127.0.0.1:5174");
    expect(plan.env.VITE_KIRAKIRA_GATEWAY_URL).toBe("ws://127.0.0.1:17373/runtime");
    expect(JSON.stringify(plan)).not.toContain("5173");
  });

  it("keeps the desktop shell runnable without daemon ownership when explicitly skipped", () => {
    const profile = resolveRuntimeProfile("workbench-host", loadRuntimeProfiles(), {});
    const plan = buildWorkbenchPlan(profile, "desktop", { skipInfra: true, skipDaemon: true });

    expect(plan.steps.map((step) => step.name)).toEqual([
      "desktop-renderer",
      "desktop-shell",
    ]);
    expect(plan.steps.map((step) => step.mode)).toEqual(["background", "foreground"]);
    expect(plan.steps[1]).toMatchObject({
      name: "desktop-shell",
      waitFor: ["presentation:desktop"],
    });
    expect(plan.env.KIRAKIRA_DESKTOP_RENDERER_URL).toBe("http://127.0.0.1:5174");
    expect(JSON.stringify(plan)).not.toContain("5173");
  });

  it("can plan a daemon-only startup without UI or implicit infra", () => {
    const profile = resolveRuntimeProfile("workbench-host", loadRuntimeProfiles(), {});
    const plan = buildWorkbenchPlan(profile, "daemon", { skipInfra: true });

    expect(plan.steps).toHaveLength(1);
    expect(plan.readiness.compose).toBeUndefined();
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

  it("filters readiness plans by declared waitFor check names", () => {
    const profile = resolveRuntimeProfile("workbench-host", loadRuntimeProfiles(), {});
    const plan = buildWorkbenchPlan(profile, "desktop", { skipInfra: true });
    const selected = readinessPlanForCheckNames(plan.readiness, [
      "daemon:socket",
      "presentation:desktop",
    ]);

    expect(selected.checks.map((check) => check.name)).toEqual([
      "daemon:socket",
      "presentation:desktop",
    ]);
    expect(() => readinessPlanForCheckNames(plan.readiness, ["missing:check"])).toThrow(
      /Readiness checks not found: missing:check/u,
    );
  });

  it("exposes the shared web and desktop smoke contracts from launcher plans", () => {
    const profile = resolveRuntimeProfile("workbench-host", loadRuntimeProfiles(), {});
    const webPlan = buildWorkbenchPlan(profile, "web", { skipInfra: true });
    const desktopPlan = buildWorkbenchPlan(profile, "desktop", { skipInfra: true });

    expect(resolveWorkbenchSmokeContract(profile, webPlan)).toEqual({
      checks: ["daemon:browser-gateway", "presentation:web"],
    });
    expect(resolveWorkbenchSmokeContract(profile, desktopPlan)).toEqual({
      checks: ["daemon:socket", "daemon:browser-gateway", "presentation:desktop"],
      stepOverrides: [
        {
          step: "desktop-shell",
          mode: "foreground",
          env: {
            [WORKBENCH_ELECTRON_SMOKE_ENV]: "1",
          },
        },
      ],
    });

    const desktopSmoke = buildWorkbenchSmokePlan(profile, "desktop", { skipInfra: true });
    const shell = desktopSmoke.steps.find((step) => step.name === "desktop-shell");
    expect(shell).toMatchObject({
      mode: "foreground",
      env: {
        [WORKBENCH_ELECTRON_SMOKE_ENV]: "1",
      },
    });
    expect(JSON.stringify({ webPlan, desktopPlan, desktopSmoke })).not.toContain("5173");
  });

  it("polls waitFor readiness checks until the selected checks pass", async () => {
    const profile = resolveRuntimeProfile("workbench-host", loadRuntimeProfiles(), {});
    const plan = buildWorkbenchPlan(profile, "web", { skipInfra: true });
    let now = 0;
    let calls = 0;
    const reportFor = (status: "fail" | "ok") => ({
      ok: status === "ok",
      checks: [
        {
          name: "daemon:browser-gateway",
          status,
          required: true,
          detail: status === "fail" ? "not ready" : undefined,
        },
      ],
    });

    const report = await waitForReadinessChecks(plan.readiness, ["daemon:browser-gateway"], {
      env: {},
      timeoutMs: 50,
      intervalMs: 10,
      probeTimeoutMs: 5,
      now: () => now,
      sleep: async (ms: number) => {
        now += ms;
      },
      evaluate: async (selectedPlan: typeof plan.readiness, options: { timeoutMs: number }) => {
        calls += 1;
        expect(selectedPlan.checks.map((check) => check.name)).toEqual([
          "daemon:browser-gateway",
        ]);
        expect(options.timeoutMs).toBe(5);
        return calls === 1 ? reportFor("fail") : reportFor("ok");
      },
    });

    expect(report?.ok).toBe(true);
    expect(calls).toBe(2);
  });

  it("reports the failing readiness check when waitFor times out", async () => {
    const profile = resolveRuntimeProfile("workbench-host", loadRuntimeProfiles(), {});
    const plan = buildWorkbenchPlan(profile, "web", { skipInfra: true });

    await expect(
      waitForReadinessChecks(plan.readiness, ["daemon:browser-gateway"], {
        env: {},
        timeoutMs: 0,
        intervalMs: 10,
        now: () => 0,
        sleep: async () => {},
        evaluate: async () => ({
          ok: false,
          checks: [
            {
              name: "daemon:browser-gateway",
              status: "fail",
              required: true,
              detail: "connection refused",
            },
          ],
        }),
      }),
    ).rejects.toThrow(/daemon:browser-gateway: fail \(connection refused\)/u);
  });

  it("executes workbench steps in order and cleans up background children", async () => {
    const profile = resolveRuntimeProfile("workbench-host", loadRuntimeProfiles(), {});
    const plan = buildWorkbenchPlan(profile, "web");
    const events: string[] = [];
    const supervisor = new WorkbenchProcessSupervisor({
      spawn: (step) => {
        events.push(`spawn:${step.name}`);
        const child = fakeChild(step.name);
        return child;
      },
      forceStop: (child) => {
        events.push(`stop:${child.name}`);
        child.killed = true;
        child.emit("close", 0, null);
      },
    });

    await runWorkbenchPlan(plan, {
      supervisor,
      runChecked: (step) => {
        events.push(`run:${step.name}`);
      },
      waitForReadiness: async (_readiness, checks) => {
        events.push(`wait:${checks.join(",")}`);
      },
      runForeground: async (step) => {
        events.push(`foreground:${step.name}`);
      },
    });

    expect(events).toEqual([
      "run:infra",
      "spawn:daemon",
      "wait:daemon:browser-gateway",
      "foreground:web",
      "stop:daemon",
    ]);
  });

  it("fails fast when a background step exits during readiness wait", async () => {
    const profile = resolveRuntimeProfile("workbench-host", loadRuntimeProfiles(), {});
    const plan = buildWorkbenchPlan(profile, "web", { skipInfra: true });
    let daemon: ReturnType<typeof fakeChild> | undefined;
    const supervisor = new WorkbenchProcessSupervisor({
      spawn: (step) => {
        daemon = fakeChild(step.name);
        return daemon;
      },
      forceStop: (child) => {
        child.killed = true;
        child.emit("close", 0, null);
      },
    });

    const run = runWorkbenchPlan(plan, {
      supervisor,
      waitForReadiness: async () => new Promise(() => {}),
      runForeground: async () => {
        throw new Error("foreground should not start");
      },
    });

    await Promise.resolve();
    daemon?.emit("close", 1, null);

    await expect(run).rejects.toThrow(/Background step "daemon" exited early with code 1/u);
  });

  it("fails fast when a background step exits while foreground is running", async () => {
    const profile = resolveRuntimeProfile("workbench-host", loadRuntimeProfiles(), {});
    const plan = buildWorkbenchPlan(profile, "web", { skipInfra: true });
    let daemon: ReturnType<typeof fakeChild> | undefined;
    const supervisor = new WorkbenchProcessSupervisor({
      spawn: (step) => {
        daemon = fakeChild(step.name);
        return daemon;
      },
      forceStop: (child) => {
        child.killed = true;
        child.emit("close", 0, null);
      },
    });

    const run = runWorkbenchPlan(plan, {
      supervisor,
      waitForReadiness: async () => {},
      runForeground: async () => new Promise(() => {}),
    });

    await Promise.resolve();
    daemon?.emit("close", 1, null);

    await expect(run).rejects.toThrow(/Background step "daemon" exited early with code 1/u);
  });
});

function fakeChild(name: string) {
  const child = new EventEmitter() as EventEmitter & {
    killed: boolean;
    name: string;
    exitCode: number | null;
    kill: (signal?: string) => boolean;
  };
  child.name = name;
  child.killed = false;
  child.exitCode = null;
  child.kill = () => {
    child.killed = true;
    child.emit("close", 0, null);
    return true;
  };
  return child;
}
