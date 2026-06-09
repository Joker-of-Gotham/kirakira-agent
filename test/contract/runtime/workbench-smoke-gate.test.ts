import { EventEmitter } from "node:events";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildWorkbenchSmokePlan,
  runWorkbenchSmokePlan,
  WORKBENCH_ELECTRON_SMOKE_ENV,
  WorkbenchProcessSupervisor,
} from "../../../scripts/kirakira-workbench.mjs";
import {
  loadRuntimeProfiles,
  resolveRuntimeProfile,
} from "../../../scripts/runtime-profile.mjs";

const repoRoot = resolve(import.meta.dirname, "..", "..", "..");

describe("workbench live smoke gate contract", () => {
  it("builds web smoke readiness from the resolved workbench-host profile", () => {
    const profile = resolveRuntimeProfile("workbench-host", loadRuntimeProfiles(), {
      KIRAKIRA_WEB_PORT: "5199",
      KIRAKIRA_BROWSER_GATEWAY_PORT: "17399",
    });
    const plan = buildWorkbenchSmokePlan(profile, "web", { skipInfra: true });

    expect(plan.steps.map((step) => [step.name, step.mode])).toEqual([
      ["daemon", "background"],
      ["web", "background"],
    ]);
    expect(plan.smoke.checks).toEqual(["daemon:browser-gateway", "presentation:web"]);
    expect(plan.readiness.checks).toContainEqual(
      expect.objectContaining({
        name: "daemon:browser-gateway",
        target: "http://127.0.0.1:17399/healthz",
      }),
    );
    expect(plan.readiness.checks).toContainEqual(
      expect.objectContaining({
        name: "presentation:web",
        target: "http://127.0.0.1:5199/",
      }),
    );
    expect(JSON.stringify(plan)).not.toContain("5173");
  });

  it("accepts the documented smoke CLI flags without starting live dependencies", () => {
    const result = spawnSync(
      process.execPath,
      [
        "scripts/kirakira-workbench.mjs",
        "--smoke",
        "--dry-run",
        "--profile",
        "workbench-host",
        "--surface",
        "web",
        "--skip-infra",
        "--timeout-ms",
        "120000",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        maxBuffer: 4 * 1024 * 1024,
      },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).not.toContain("5173");

    const plan = JSON.parse(result.stdout) as {
      profile: string;
      surface: string;
      smoke: { checks: string[] };
      steps: Array<{ name: string; mode: string }>;
    };
    expect(plan.profile).toBe("workbench-host");
    expect(plan.surface).toBe("web");
    expect(plan.smoke.checks).toEqual(["daemon:browser-gateway", "presentation:web"]);
    expect(plan.steps.map((step) => [step.name, step.mode])).toEqual([
      ["daemon", "background"],
      ["web", "background"],
    ]);
  });

  it("reports selected smoke readiness targets from the smoke CLI dry-run", () => {
    const result = spawnSync(
      process.execPath,
      [
        "scripts/kirakira-workbench-smoke.mjs",
        "--dry-run",
        "--profile",
        "workbench-host",
        "--surface",
        "web",
        "--skip-infra",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          KIRAKIRA_WEB_PORT: "5199",
          KIRAKIRA_BROWSER_GATEWAY_PORT: "17399",
        },
        maxBuffer: 4 * 1024 * 1024,
      },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).not.toContain("5173");

    const report = JSON.parse(result.stdout) as {
      checks: string[];
      readinessPlan: {
        compose?: unknown;
        checks: Array<{ name: string; target?: string; endpoint?: string }>;
      };
    };

    expect(report.checks).toEqual(report.readinessPlan.checks.map((check) => check.name));
    expect(report.readinessPlan.compose).toBeUndefined();
    expect(report.readinessPlan.checks).toEqual([
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
  });

  it("reports the profile-owned web and desktop smoke gate from the smoke CLI dry-run", () => {
    const result = spawnSync(
      process.execPath,
      [
        "scripts/kirakira-workbench-smoke.mjs",
        "--dry-run",
        "--profile",
        "workbench-host",
        "--gate",
        "presentation",
        "--skip-infra",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        maxBuffer: 4 * 1024 * 1024,
      },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).not.toContain("5173");

    const report = JSON.parse(result.stdout) as {
      profile: string;
      gate: string;
      gateSource: string;
      checks: string[];
      targets: Record<string, { target?: string; endpoint?: string }>;
      surfaces: Array<{ surface: string; checks: string[] }>;
    };

    expect(report.profile).toBe("workbench-host");
    expect(report.gate).toBe("presentation");
    expect(report.gateSource).toBe("runtime-profile.workbench.smokeGates");
    expect(report.surfaces.map((surface) => surface.surface)).toEqual(["web", "desktop"]);
    expect(report.checks).toEqual([
      "daemon:browser-gateway",
      "presentation:web",
      "daemon:socket",
      "presentation:desktop",
    ]);
    expect(report.targets).toMatchObject({
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
  });

  it("reports the same hidden Electron smoke contract from launcher desktop dry-run", () => {
    const result = spawnSync(
      process.execPath,
      [
        "scripts/kirakira-workbench.mjs",
        "--smoke",
        "--dry-run",
        "--profile",
        "workbench-host",
        "--surface",
        "desktop",
        "--skip-infra",
        "--timeout-ms",
        "120000",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        maxBuffer: 4 * 1024 * 1024,
      },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).not.toContain("5173");

    const plan = JSON.parse(result.stdout) as {
      profile: string;
      surface: string;
      smoke: {
        checks: string[];
        stepOverrides?: Array<{ step: string; mode: string; env: Record<string, string> }>;
      };
      steps: Array<{ name: string; mode: string; env?: Record<string, string> }>;
    };
    const shell = plan.steps.find((step) => step.name === "desktop-shell");

    expect(plan.profile).toBe("workbench-host");
    expect(plan.surface).toBe("desktop");
    expect(plan.smoke.checks).toEqual([
      "daemon:socket",
      "daemon:browser-gateway",
      "presentation:desktop",
    ]);
    expect(plan.smoke.stepOverrides).toEqual([
      {
        step: "desktop-shell",
        mode: "foreground",
        env: {
          [WORKBENCH_ELECTRON_SMOKE_ENV]: "1",
        },
      },
    ]);
    expect(shell).toMatchObject({
      mode: "foreground",
      env: {
        [WORKBENCH_ELECTRON_SMOKE_ENV]: "1",
      },
    });
  });

  it("waits for surface readiness after all smoke processes are supervised", async () => {
    const profile = resolveRuntimeProfile("workbench-host", loadRuntimeProfiles(), {});
    const plan = buildWorkbenchSmokePlan(profile, "web", { skipInfra: true });
    const events: string[] = [];
    const stopChild = (child: ReturnType<typeof fakeChild>) => {
      events.push(`stop:${child.name}`);
      child.killed = true;
      child.emit("close", 0, null);
    };
    const supervisor = new WorkbenchProcessSupervisor({
      spawn: (step) => {
        events.push(`spawn:${step.name}`);
        return fakeChild(step.name);
      },
      forceStop: stopChild,
      gracefulStop: stopChild,
    });

    await runWorkbenchSmokePlan(plan, {
      supervisor,
      waitForReadiness: async (_readiness, checks) => {
        events.push(`wait:${checks.join(",")}`);
      },
    });

    expect(events).toEqual([
      "spawn:daemon",
      "wait:daemon:browser-gateway",
      "spawn:web",
      "wait:daemon:browser-gateway,presentation:web",
      "stop:web",
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
