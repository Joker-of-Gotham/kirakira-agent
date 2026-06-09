import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import {
  buildWorkbenchSmokeCommand,
  normalizeSmokeArgs,
  runWorkbenchSmoke,
} from "../../../scripts/kirakira-workbench-smoke.mjs";
import {
  buildWorkbenchSmokePlan,
  WORKBENCH_ELECTRON_SMOKE_ENV,
} from "../../../scripts/kirakira-workbench.mjs";
import {
  loadRuntimeProfiles,
  resolveRuntimeProfile,
} from "../../../scripts/runtime-profile.mjs";

describe("workbench smoke gate", () => {
  it("parses the opt-in live command shape", () => {
    const options = normalizeSmokeArgs([
      "--profile",
      "workbench-host",
      "--surface",
      "web",
      "--timeout-ms",
      "120000",
      "--live",
    ]);

    expect(options).toMatchObject({
      profileName: "workbench-host",
      surface: "web",
      timeoutMs: 120_000,
      live: true,
    });
  });

  it("builds a profile-derived web smoke plan without live mode by default", () => {
    const smoke = buildWorkbenchSmokeCommand(
      {
        profileName: "workbench-host",
        surface: "web",
        skipInfra: true,
      },
      {},
    );

    expect(smoke.live).toBe(false);
    expect(smoke.plan.profile).toBe("workbench-host");
    expect(smoke.plan.surface).toBe("web");
    expect(smoke.plan.steps.map((step) => [step.name, step.mode])).toEqual([
      ["daemon", "background"],
      ["web", "background"],
    ]);
    expect(smoke.checks).toEqual(["daemon:browser-gateway", "presentation:web"]);
    expect(smoke.readiness.timeoutMs).toBe(120_000);
    expect(JSON.stringify(smoke)).not.toContain("5173");
  });

  it("uses environment opt-in for live E2E runs", () => {
    const smoke = buildWorkbenchSmokeCommand(
      {
        profileName: "workbench-host",
        surface: "web",
        skipInfra: true,
      },
      {
        KIRAKIRA_LIVE_E2E: "1",
      },
    );

    expect(smoke.live).toBe(true);
  });

  it("reuses the launcher smoke plan contract for web and desktop commands", () => {
    const profile = resolveRuntimeProfile("workbench-host", loadRuntimeProfiles(), {});

    for (const surface of ["web", "desktop"]) {
      const smoke = buildWorkbenchSmokeCommand(
        {
          profileName: "workbench-host",
          surface,
          skipInfra: true,
        },
        {},
      );
      const launcherPlan = buildWorkbenchSmokePlan(profile, surface, { skipInfra: true });

      expect(smoke.plan).toEqual(launcherPlan);
      expect(JSON.stringify(smoke.plan)).not.toContain("5173");
    }
  });

  it("reads desktop smoke checks from the selected runtime profile", () => {
    const smoke = buildWorkbenchSmokeCommand(
      {
        profileName: "workbench-host",
        surface: "desktop",
        skipInfra: true,
      },
      {},
    );

    expect(smoke.checks).toEqual([
      "daemon:socket",
      "daemon:browser-gateway",
      "presentation:desktop",
    ]);
    expect(JSON.stringify(smoke)).not.toContain("5173");
  });

  it("keeps desktop Electron smoke non-interactive and profile-derived", () => {
    const smoke = buildWorkbenchSmokeCommand(
      {
        profileName: "workbench-host",
        surface: "desktop",
        skipInfra: true,
      },
      {},
    );

    expect(smoke.plan.steps.map((step) => [step.name, step.mode])).toEqual([
      ["daemon", "background"],
      ["desktop-renderer", "background"],
      ["desktop-shell", "foreground"],
    ]);
    expect(
      smoke.plan.steps.find((step) => step.name === "desktop-shell")?.env
        [WORKBENCH_ELECTRON_SMOKE_ENV],
    ).toBe("1");
    expect(smoke.plan.smoke.stepOverrides).toEqual([
      {
        step: "desktop-shell",
        mode: "foreground",
        env: {
          [WORKBENCH_ELECTRON_SMOKE_ENV]: "1",
        },
      },
    ]);
    expect(smoke.checks).toEqual([
      "daemon:socket",
      "daemon:browser-gateway",
      "presentation:desktop",
    ]);
    expect(JSON.stringify(smoke)).not.toContain("5173");
  });

  it("runs foreground workbench steps as bounded smoke processes", async () => {
    const smoke = buildWorkbenchSmokeCommand(
      {
        profileName: "workbench-host",
        surface: "web",
        skipInfra: true,
        timeoutMs: 50,
      },
      {},
    );
    const events: string[] = [];
    const supervisor = {
      assertHealthy() {
        events.push("healthy");
      },
      waitForFailure() {
        return new Promise<never>(() => {});
      },
      spawnBackground(step: { name: string }) {
        events.push(`spawn:${step.name}`);
        return fakeChild(step.name);
      },
      async stopAll() {
        events.push("stop");
      },
    };

    await runWorkbenchSmoke(smoke, {
      supervisor,
      waitForReadiness: async (_readiness, checks, options) => {
        events.push(`wait:${checks.join(",")}:${options.timeoutMs}`);
      },
    });

    expect(events).toEqual([
      "healthy",
      "spawn:daemon",
      "healthy",
      "wait:daemon:browser-gateway:50",
      "spawn:web",
      "wait:daemon:browser-gateway,presentation:web:50",
      "stop",
    ]);
  });

  it("runs the desktop Electron smoke shell as a foreground assertion", async () => {
    const smoke = buildWorkbenchSmokeCommand(
      {
        profileName: "workbench-host",
        surface: "desktop",
        skipInfra: true,
        timeoutMs: 75,
      },
      {},
    );
    const events: string[] = [];
    const supervisor = {
      assertHealthy() {
        events.push("healthy");
      },
      waitForFailure() {
        return new Promise<never>(() => {});
      },
      spawnBackground(step: { name: string }) {
        events.push(`spawn:${step.name}`);
        return fakeChild(step.name);
      },
      async stopAll() {
        events.push("stop");
      },
    };

    await runWorkbenchSmoke(smoke, {
      supervisor,
      runForeground: async (step: { name: string; env: Record<string, string> }) => {
        events.push(
          `foreground:${step.name}:${step.env[WORKBENCH_ELECTRON_SMOKE_ENV]}`,
        );
      },
      waitForReadiness: async (_readiness, checks, options) => {
        events.push(`wait:${checks.join(",")}:${options.timeoutMs}`);
      },
    });

    expect(events).toEqual([
      "healthy",
      "spawn:daemon",
      "healthy",
      "spawn:desktop-renderer",
      "healthy",
      "wait:daemon:socket,daemon:browser-gateway,presentation:desktop:75",
      "foreground:desktop-shell:1",
      "wait:daemon:socket,daemon:browser-gateway,presentation:desktop:75",
      "stop",
    ]);
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
