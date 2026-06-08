import { describe, expect, it } from "vitest";
import { buildWorkbenchPlan } from "../../../scripts/kirakira-workbench.mjs";
import { loadRuntimeProfiles, resolveRuntimeProfile } from "../../../scripts/runtime-profile.mjs";

describe("workbench launcher plan", () => {
  it("plans infra, daemon, and web from the workbench profile", () => {
    const profile = resolveRuntimeProfile("workbench-host", loadRuntimeProfiles());
    const plan = buildWorkbenchPlan(profile, "web");

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
        "postgres",
        "redis",
        "qdrant",
        "neo4j",
        "minio",
        "kirakirad",
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
    const profile = resolveRuntimeProfile("workbench-host", loadRuntimeProfiles());
    const plan = buildWorkbenchPlan(profile, "daemon", { skipInfra: true });

    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]).toMatchObject({
      name: "daemon",
      mode: "foreground",
      args: ["--filter", "@kirakira/runtime-daemon", "start"],
    });
  });

  it("plans new workbench surfaces from profile configuration", () => {
    const profile = resolveRuntimeProfile("workbench-host", loadRuntimeProfiles());
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
    const profile = resolveRuntimeProfile("workbench-host", loadRuntimeProfiles());
    const plan = buildWorkbenchPlan(profile, undefined, { skipInfra: true, skipDaemon: true });

    expect(plan.surface).toBe("web");
    expect(plan.steps.map((step) => step.name)).toEqual(["web"]);
  });

  it("fails loudly for unknown surfaces and package references", () => {
    const profile = resolveRuntimeProfile("workbench-host", loadRuntimeProfiles());

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
