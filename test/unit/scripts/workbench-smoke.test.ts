import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { EventEmitter } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertWorkbenchSmokeTargetsAvailable,
  buildWorkbenchSmokeCommand,
  buildWorkbenchSmokeGateCommand,
  normalizeSmokeArgs,
  ownedWorkbenchSmokeTcpTargets,
  ownedWorkbenchSmokeTargetNames,
  runWorkbenchSmoke,
  runWorkbenchSmokeGate,
  writeWorkbenchSmokeResult,
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

  it("parses a profile-owned gate command shape", () => {
    const options = normalizeSmokeArgs([
      "--profile",
      "workbench-host",
      "--gate",
      "presentation",
      "--timeout-ms",
      "120000",
      "--live",
    ]);

    expect(options).toMatchObject({
      profileName: "workbench-host",
      gateName: "presentation",
      timeoutMs: 120_000,
      live: true,
    });
    expect(normalizeSmokeArgs(["--gate", "presentation", "--", "--dry-run"])).toMatchObject({
      gateName: "presentation",
      dryRun: true,
    });
    expect(
      normalizeSmokeArgs([
        "--gate",
        "presentation",
        "--result",
        "tmp/workbench-smoke.json",
        "--no-write-result",
      ]),
    ).toMatchObject({
      gateName: "presentation",
      resultPath: expect.stringContaining("tmp"),
      writeResult: false,
    });
    expect(() => normalizeSmokeArgs(["--gate", "presentation", "--surface", "web"])).toThrow(
      /--gate cannot be combined with --surface/u,
    );
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
    expect(smoke.status).toBe("skipped");
    expect(smoke.liveGate).toMatchObject({
      status: "skipped",
      command: "node scripts/kirakira-workbench-smoke.mjs --profile workbench-host --surface web --live",
      checks: ["daemon:browser-gateway", "presentation:web"],
      surfaces: ["web"],
    });
    expect(smoke.plan.profile).toBe("workbench-host");
    expect(smoke.plan.surface).toBe("web");
    expect(smoke.plan.steps.map((step) => [step.name, step.mode])).toEqual([
      ["daemon", "background"],
      ["web", "background"],
    ]);
    expect(smoke.checks).toEqual(["daemon:browser-gateway", "presentation:web"]);
    expect(smoke.checks).toEqual(smoke.readinessPlan.checks.map((check) => check.name));
    expect(smoke.targets).toEqual({
      "daemon:browser-gateway": {
        type: "http-health",
        target: "http://127.0.0.1:17373/healthz",
        endpoint: "ws://127.0.0.1:17373/runtime",
        responseSchema: "browser-gateway-health",
      },
      "presentation:web": {
        type: "http",
        target: "http://127.0.0.1:5183/",
      },
    });
    expect(smoke.readinessPlan.checks).toContainEqual(
      expect.objectContaining({
        name: "daemon:browser-gateway",
        target: "http://127.0.0.1:17373/healthz",
      }),
    );
    expect(smoke.readinessPlan.checks).toContainEqual(
      expect.objectContaining({
        name: "presentation:web",
        target: "http://127.0.0.1:5183/",
      }),
    );
    expect(smoke.readiness.timeoutMs).toBe(120_000);
    expect(smoke.targets["presentation:web"]?.target).toBe("http://127.0.0.1:5183/");
  });

  it("exposes resolved smoke readiness targets from profile endpoint overrides", () => {
    const smoke = buildWorkbenchSmokeCommand(
      {
        profileName: "workbench-host",
        surface: "web",
        skipInfra: true,
      },
      {
        KIRAKIRA_WEB_PORT: "5199",
        KIRAKIRA_BROWSER_GATEWAY_PORT: "17399",
      },
    );

    expect(smoke.checks).toEqual(["daemon:browser-gateway", "presentation:web"]);
    expect(smoke.readinessPlan.compose).toBeUndefined();
    expect(smoke.readinessPlan.checks).toEqual([
      expect.objectContaining({
        name: "daemon:browser-gateway",
        target: "http://127.0.0.1:17399/healthz",
        endpoint: "ws://127.0.0.1:17399/runtime",
      }),
      expect.objectContaining({
        name: "presentation:web",
        target: "http://127.0.0.1:5199/",
      }),
    ]);
    expect(smoke.targets["daemon:browser-gateway"]).toMatchObject({
      target: "http://127.0.0.1:17399/healthz",
      endpoint: "ws://127.0.0.1:17399/runtime",
    });
    expect(smoke.targets["presentation:web"]).toMatchObject({
      target: "http://127.0.0.1:5199/",
    });
    expect(JSON.stringify(smoke)).not.toContain("5183");
    expect(JSON.stringify(smoke)).not.toContain("17373");
  });

  it("derives live preflight targets from the owned profile surface", () => {
    const web = buildWorkbenchSmokeCommand(
      {
        profileName: "workbench-host",
        surface: "web",
        skipInfra: true,
        live: true,
      },
      {
        KIRAKIRA_WEB_PORT: "5199",
        KIRAKIRA_BROWSER_GATEWAY_PORT: "17399",
      },
    );
    const webWithoutDaemon = buildWorkbenchSmokeCommand(
      {
        profileName: "workbench-host",
        surface: "web",
        skipInfra: true,
        skipDaemon: true,
        live: true,
      },
      {
        KIRAKIRA_WEB_PORT: "5199",
        KIRAKIRA_BROWSER_GATEWAY_PORT: "17399",
      },
    );

    expect(ownedWorkbenchSmokeTargetNames(web)).toEqual([
      "daemon:browser-gateway",
      "presentation:web",
    ]);
    expect(ownedWorkbenchSmokeTcpTargets(web)).toEqual([
      expect.objectContaining({
        checkName: "daemon:browser-gateway",
        host: "127.0.0.1",
        port: 17399,
      }),
      expect.objectContaining({
        checkName: "presentation:web",
        host: "127.0.0.1",
        port: 5199,
      }),
    ]);
    expect(ownedWorkbenchSmokeTargetNames(webWithoutDaemon)).toEqual([
      "presentation:web",
    ]);
    expect(JSON.stringify({ web, webWithoutDaemon })).not.toContain("5173");
  });

  it("fails live preflight with a profile-derived occupied target report", async () => {
    const smoke = buildWorkbenchSmokeCommand(
      {
        profileName: "workbench-host",
        surface: "desktop",
        skipInfra: true,
        live: true,
      },
      {
        KIRAKIRA_DESKTOP_RENDERER_PORT: "5179",
        KIRAKIRA_BROWSER_GATEWAY_PORT: "17399",
      },
    );

    await expect(
      assertWorkbenchSmokeTargetsAvailable(smoke, {
        probe: async (target: { checkName: string; port: number; target: string }) => ({
          ...target,
          available: target.checkName !== "presentation:desktop",
          code: target.checkName === "presentation:desktop" ? "EADDRINUSE" : undefined,
        }),
      }),
    ).rejects.toThrow(
      /presentation:desktop http:\/\/127\.0\.0\.1:5179\/ on 127\.0\.0\.1:5179 \(EADDRINUSE\)/u,
    );
  });

  it("keeps full live smoke compose services in the selected readiness plan", () => {
    const smoke = buildWorkbenchSmokeCommand(
      {
        profileName: "workbench-host",
        surface: "web",
      },
      {},
    );

    expect(smoke.readinessPlan.compose).toEqual(smoke.plan.readiness.compose);
    expect(smoke.readinessPlan.compose?.args).toEqual(smoke.plan.steps[0]?.args);
    expect(smoke.readinessPlan.compose?.services).toEqual([
      "postgres",
      "redis",
      "qdrant",
      "neo4j",
      "minio",
      "kirakirad",
    ]);
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

  it("builds the profile-owned presentation smoke gate for web, desktop, and gateway targets", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "kirakira-workbench-smoke-missing-"));

    try {
      const smoke = buildWorkbenchSmokeGateCommand(
        {
          profileName: "workbench-host",
          gateName: "presentation",
          skipInfra: true,
          resultPath: join(tempRoot, "missing-result.json"),
        },
        {},
      );

      expect(smoke.live).toBe(false);
      expect(smoke.status).toBe("skipped");
      expect(smoke.liveGate).toMatchObject({
        status: "skipped",
        command: "node scripts/kirakira-workbench-smoke.mjs --profile workbench-host --gate presentation --live",
        surfaces: ["web", "desktop"],
      });
      expect(smoke.gate).toMatchObject({
        name: "presentation",
        source: "runtime-profile.workbench.smokeGates",
        liveEnv: "KIRAKIRA_WORKBENCH_SMOKE_LIVE",
        surfaces: ["web", "desktop"],
      });
      expect(smoke.surfaces.map((surface) => surface.plan.surface)).toEqual(["web", "desktop"]);
      expect(smoke.checks).toEqual([
        "daemon:browser-gateway",
        "presentation:web",
        "daemon:socket",
        "presentation:desktop",
      ]);
      expect(smoke.targets).toMatchObject({
        "daemon:browser-gateway": {
          target: "http://127.0.0.1:17373/healthz",
          endpoint: "ws://127.0.0.1:17373/runtime",
        },
        "presentation:web": {
          target: "http://127.0.0.1:5183/",
        },
        "presentation:desktop": {
          target: "http://127.0.0.1:5174/",
        },
      });
      expect(smoke.targets["presentation:web"]?.target)
        .not.toBe(smoke.targets["presentation:desktop"]?.target);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("writes and reuses durable live gate evidence", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "kirakira-workbench-smoke-"));
    const resultPath = join(tempRoot, "workbench-smoke.json");

    try {
      const smoke = buildWorkbenchSmokeGateCommand(
        {
          profileName: "workbench-host",
          gateName: "presentation",
          skipInfra: true,
          resultPath,
        },
        {},
      );

      const result = writeWorkbenchSmokeResult(smoke, resultPath);
      const stored = JSON.parse(readFileSync(resultPath, "utf8"));
      const replay = buildWorkbenchSmokeGateCommand(
        {
          profileName: "workbench-host",
          gateName: "presentation",
          skipInfra: true,
          resultPath,
        },
        {},
      );

      expect(result).toMatchObject({
        schemaVersion: 1,
        gate: "presentation",
        profile: "workbench-host",
        status: "passed",
        checks: [
          "daemon:browser-gateway",
          "presentation:web",
          "daemon:socket",
          "presentation:desktop",
        ],
        surfaces: ["web", "desktop"],
      });
      expect(stored).toMatchObject(result);
      expect(replay.status).toBe("passed");
      expect(replay.liveGate.status).toBe("passed");
      expect(replay.evidence).toMatchObject({
        resultStatus: "passed",
        resultMatches: true,
      });
      expect(replay.targets["presentation:web"]?.target)
        .not.toBe(replay.targets["presentation:desktop"]?.target);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("uses the profile gate live environment opt-in", () => {
    const smoke = buildWorkbenchSmokeGateCommand(
      {
        profileName: "workbench-host",
        gateName: "presentation",
        skipInfra: true,
      },
      {
        KIRAKIRA_WORKBENCH_SMOKE_LIVE: "1",
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
      expect(smoke.plan.profile).toBe(profile.name);
      expect(smoke.plan.surface).toBe(surface);
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
    expect(smoke.targets["presentation:desktop"]).toMatchObject({
      target: "http://127.0.0.1:5174/",
    });
    expect(smoke.targets["presentation:desktop"]?.target)
      .not.toBe(smoke.targets["presentation:web"]?.target);
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
    expect(smoke.plan.surface).toBe("desktop");
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

  it("runs an afterReady hook before tearing down smoke processes", async () => {
    const smoke = buildWorkbenchSmokeCommand(
      {
        profileName: "workbench-host",
        surface: "web",
        skipInfra: true,
        timeoutMs: 60,
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
      afterReady: async (_plan, ready) => {
        events.push(`after:${ready.checks.join(",")}`);
      },
    });

    expect(events).toEqual([
      "healthy",
      "spawn:daemon",
      "healthy",
      "wait:daemon:browser-gateway:60",
      "spawn:web",
      "wait:daemon:browser-gateway,presentation:web:60",
      "after:daemon:browser-gateway,presentation:web",
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

  it("runs every surface in a profile-owned smoke gate", async () => {
    const smoke = buildWorkbenchSmokeGateCommand(
      {
        profileName: "workbench-host",
        gateName: "presentation",
        skipInfra: true,
        timeoutMs: 90,
      },
      {},
    );
    const events: string[] = [];

    await runWorkbenchSmokeGate(smoke, {
      processes: {
        spawn: (step: { name: string }) => {
          events.push(`spawn:${step.name}`);
          return fakeChild(step.name);
        },
        forceStop: (child: ReturnType<typeof fakeChild>) => {
          events.push(`stop:${child.name}`);
          child.killed = true;
          child.emit("close", 0, null);
        },
        gracefulStop: (child: ReturnType<typeof fakeChild>) => {
          events.push(`stop:${child.name}`);
          child.killed = true;
          child.emit("close", 0, null);
        },
      },
      runForeground: async (step: { name: string }) => {
        events.push(`foreground:${step.name}`);
      },
      waitForReadiness: async (_readiness, checks, options) => {
        events.push(`wait:${checks.join(",")}:${options.timeoutMs}`);
      },
    });

    expect(events).toEqual([
      "spawn:daemon",
      "wait:daemon:browser-gateway:90",
      "spawn:web",
      "wait:daemon:browser-gateway,presentation:web:90",
      "stop:web",
      "stop:daemon",
      "spawn:daemon",
      "spawn:desktop-renderer",
      "wait:daemon:socket,daemon:browser-gateway,presentation:desktop:90",
      "foreground:desktop-shell",
      "wait:daemon:socket,daemon:browser-gateway,presentation:desktop:90",
      "stop:desktop-renderer",
      "stop:daemon",
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
